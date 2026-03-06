/**
 * NETWORK MANAGER
 * Monitors activity to determine the ideal moment for export
 */

const AUTHORIZED_URL = ["https://univ-scholarvox-com.gorgone.univ-toulouse.fr/*",
    "https://univ-scholarvox-com.bnf.idm.oclc.org/*",
    "https://univ-scholarvox-com.ressources.univ-poitiers.fr/",
    "https://*.scholarvox.com/*",
    "https://unr-ra.scholarvox.com/*",
    "https://readerlb-cyberlibris-com.gorgone.univ-toulouse.fr/*",
    "https://*.cyberlibris.com/*"]

const NetworkManager = {
  activity: {}, // { tabId: { requests: Set, lastChange: ms } }

  init() {
    browser.webRequest.onBeforeRequest.addListener(
      (d) => this._track(d.tabId, d.requestId),
      { urls: AUTHORIZED_URL }
    );
    browser.webRequest.onCompleted.addListener(
      (d) => this._release(d.tabId, d.requestId),
      { urls: AUTHORIZED_URL }
    );
    browser.webRequest.onErrorOccurred.addListener(
      (d) => this._release(d.tabId, d.requestId),
      { urls: AUTHORIZED_URL }
    );
  },

  _track(tabId, reqId) {
    if (tabId === -1) return;
    if (!this.activity[tabId]) this.activity[tabId] = { requests: new Set(), lastChange: Date.now() };
    this.activity[tabId].requests.add(reqId);
    this.activity[tabId].lastChange = Date.now();
  },

  _release(tabId, reqId) {
    const state = this.activity[tabId];
    if (state) {
      state.requests.delete(reqId);
      state.lastChange = Date.now();
    }
  },

  async waitIdle(tabId, quietTime = 700, maxWait = 10000) {
    const start = Date.now();
    return new Promise(resolve => {
      const poll = setInterval(() => {
        const state = this.activity[tabId];
        const now = Date.now();
        
        // Resolve if no state exists, or if requests are finished and quiet time has passed, or if max wait is reached
        if (!state || (state.requests.size === 0 && (now - state.lastChange) > quietTime) || (now - start > maxWait)) {
          clearInterval(poll);
          resolve();
        }
      }, 200);
    });
  }
};

/**
 * PIPELINE STORE
 */
const PipelineStore = {
  data: {},

  init(docId, params) {
    this.data[docId] = {
      exportState: 'idle',
      fontCache: {},
      uiState: {},
      ...params
    };
  },

  get(docId) { return this.data[docId]; },
  
  getByTabId(tabId) {
    return Object.values(this.data).find(p => p.tabId === tabId);
  },

  updateUI(docId, stateName, stateValue) {
    if (!this.data[docId]) return;
    this.data[docId].uiState[stateName] = stateValue;
    
    // Notification to the popup (if open)
    browser.runtime.sendMessage({
      action: "pipelineUpdate",
      tabId: this.data[docId].tabId,
      pipeline: this.data[docId].uiState
    }).catch(() => {/* Popup closed */});
  },

  remove(docId) {
    const tabId = this.data[docId]?.tabId;
    if (tabId) {
      browser.runtime.sendMessage({
        action: "pipelineUpdate",
        tabId: tabId,
        pipeline: 'end_cycle'
      }).catch(() => {});
      
      // IMPORTANT: Release a slot in the queue
      QueueManager.taskDone();
    }
    
    delete this.data[docId];
  }
};

/**
 * AUTO-START MANAGER
 * Opens a new tab and automatically launches a pipeline
 */
const AutoStartManager = {
  // This method is called by user action
  async launch(url) {
    QueueManager.enqueue(url);
  },

  // This method is called by the QueueManager when a slot becomes available
  async executeLaunch(url) {
    const newTab = await browser.tabs.create({ url });
    const result = await browser.storage.local.get('settings');

    const listener = (tabId, info) => {
      if (tabId === newTab.id && info.status === "complete") {
        browser.tabs.onUpdated.removeListener(listener);
        
        const docId = this.extractDocId(url);
        if (!docId) {
            QueueManager.taskDone(); // Security check if docId is invalid
            return;
        }

        const savedSettings = result.settings || {scrollSpeed:10, captureZoom:1, theme:"auto", defaultMode: "html"};

        PipelineStore.init(docId, {
          exportState: "waiting_viewer",
          docId,
          tabId: newTab.id,
          exportMode: savedSettings.defaultMode,
          fontCache: {},
          settings: { 
            captureZoom: savedSettings.captureZoom, 
            scrollSpeed: savedSettings.scrollSpeed, 
            pageStart: null, 
            pageEnd: null
          },
          uiState: { download_asked: "ok" }
        });

        browser.tabs.sendMessage(newTab.id, {
          action: "start",
          state: "ready_to_begin",
          docId
        });
      }
    };

    browser.tabs.onUpdated.addListener(listener);
  },

  extractDocId(url) {
    const m = url.match(/docid\/(\d+)/);
    return m ? m[1] : null;
  }
};

/**
 * QUEUE MANAGER
 */
const QueueManager = {
  queue: [],
  activeCount: 0,
  MAX_CONCURRENT: 0, //  the maximum number of simultaneous is taken from settings
  // Adds a new URL to the queue
  async enqueue(url) {
    if(this.MAX_CONCURRENT == 0){
     const settings = (await browser.storage.local.get('settings')).settings;
     const max = settings?.maxQueue || 2;
     this.MAX_CONCURRENT = max;
    }
    this.queue.push(url);
    this.process();
  },

  // Attempts to launch the next task
  async process() {
    if (this.activeCount >= this.MAX_CONCURRENT || this.queue.length === 0) {
      console.log(`Queue: Waiting (${this.activeCount}/${this.MAX_CONCURRENT})`);
      return;
    }
    this.activeCount++;
    const nextUrl = this.queue.shift();
    
    console.log(`Queue: Launching ${nextUrl}. Active: ${this.activeCount}`);
    
    try {
      // Use a version of launch that only takes the URL
      await AutoStartManager.executeLaunch(nextUrl);
    } catch (e) {
      console.error("Queue: Launch failed", e);
      this.taskDone(); // Release the slot if launch fails
    }
  },

  // Called when an export is finished (success or error)
  taskDone() {
    this.activeCount--;
    console.log(`Queue: Task finished. Free slots: ${this.MAX_CONCURRENT - this.activeCount}`);
    this.process();
  }
};


/**
 * MESSAGE RECEIVING ACTIONS
 */
const Actions = {
  async auto_start_capture(msg) { await AutoStartManager.launch(msg.url); },

  async isDownloaded(msg) {
    const history = await getHistory();
    const entry = history?.find(h => h.id === msg.docId);

    if (!entry) return { downloaded: false };
    if (entry.state === "processing") return { downloaded: false };

    return { downloaded: true, state: entry.state };
  },

  async setExportMode(msg) {
    PipelineStore.init(msg.docId, {
      exportMode: msg.mode,
      docId: msg.docId,
      settings: { captureZoom: msg.captureZoom, scrollSpeed: msg.scrollSpeed, pageStart: msg.pageStart, pageEnd: msg.pageEnd},
      uiState: { 'download_asked': 'ok' },
    });
    console.warn(msg.pageStart);
    console.warn(msg.pageEnd);

    PipelineStore.updateUI(msg.docId, 'process_launched', 'ok');
    PipelineStore.updateUI(msg.docId, 'stabilized_viewer', 'processing');
  },

  async initialize_document(msg, sender) {
    const pipe = PipelineStore.get(msg.docId);
    if (!pipe) return;

    pipe.tabId = sender.tab.id;
    pipe.domain = msg.completeDomain;
    pipe.exportState = 'waiting_viewer';
    
    // Metadata & History
    const meta = await scrapeMetadata(msg.docId, msg.completeDomain);
    pipe.metadata = meta;
    
    const coverUri = await urlToDataUri(meta.cover);
    const historyItem = createHistoryItem({
      id: msg.docId,
      title: meta.title,
      authors: meta.authors,
      domain: msg.shortDomain,
      url: `${msg.completeDomain}/catalog/book/docid/${msg.docId}`,
      cover: coverUri,
      state: "processing"
    });
    await addToHistory(historyItem);
  },

  async scroll_ended(msg) {
    const pipe = PipelineStore.get(msg.docId);
    if (!pipe) return;

    pipe.exportState = 'ready_to_export';
    await NetworkManager.waitIdle(pipe.tabId);

    browser.tabs.sendMessage(pipe.tabId, {
      action: "start",
      state: 'ready_to_export',
      docId: msg.docId,
      mode: pipe.exportMode,
      pageStart : pipe.settings.pageStart, 
      pageEnd: pipe.settings.pageEnd
    });
  },

  async export_html_zip(msg) {
    const pipe = PipelineStore.get(msg.docId);
    if (!pipe) return;

    await createAndDownloadZip(msg.docId, msg.html, pipe.metadata, pipe.metadata.cover, pipe.fontCache);
    await updateHistoryItem(msg.docId, { state: pipe.exportMode });
    
    PipelineStore.updateUI(msg.docId, 'html_generated', 'ok');
    PipelineStore.remove(msg.docId);
  },

  async pdf_done(msg) {
    PipelineStore.updateUI(msg.docId, 'pdf_print', 'ok'); // Clean UI state before removal
    PipelineStore.remove(msg.docId);
  }
};

/**
 * MAIN ENTRY POINT
 */
NetworkManager.init();

// Capture fonts on the fly
browser.webRequest.onCompleted.addListener(
  async (details) => {
    if (details.type !== "font") return;
    const pipe = PipelineStore.getByTabId(details.tabId);
    if (!pipe || pipe.fontCache[details.url]) return;

    try {
      const res = await fetch(details.url);
      const blob = await res.blob();
      pipe.fontCache[details.url] = { blob, filename: details.url.split("/").pop() };
    } catch (e) { console.warn("Font fetch failed", e); }
  },
  { urls: AUTHORIZED_URL }
);

browser.runtime.onMessage.addListener((msg, sender) => {
  // Synchronous actions with immediate return
  if (msg.action === "get_fonts") return Promise.resolve(PipelineStore.get(msg.docId)?.fontCache || {});
  if (msg.action === "getPipelineData") return Promise.resolve(PipelineStore.get(msg.docId));
  if (msg.action === "getPipelineState") {
    const pipe = PipelineStore.getByTabId(msg.tabId);
    return Promise.resolve(pipe ? pipe.uiState : 'end_cycle');
  }
  if (msg.action === "isDownloaded") {
    return Actions.isDownloaded(msg);
  }

  // Asynchronous actions (via Actions router)
  if (Actions[msg.action]) {
    Actions[msg.action](msg, sender);
  }
  
  // Specific UI state update handling
  if (msg.action === "updateUiState") {
    PipelineStore.updateUI(msg.docId, msg.stateName, msg.stateValue);
  }
});