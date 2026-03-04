/**
 * CONFIGURATION & CONSTANTS
 */
const CONFIG = {
  MAX_WAIT_MS: 4000,
  STABLE_CHECK_COUNT: 5,
  SCROLL_DELAY_BASE: 400,
};

/**
 * 1. COMMUNICATION UTILITIES
 * Centralizes messaging to the background script to avoid repetition
 */
const Messenger = {
  send: (action, data = {}) => browser.runtime.sendMessage({ action, ...data }),
  
  updateStatus: (docId, stateName, stateValue) => {
    return Messenger.send("updateUiState", { docId, stateName, stateValue });
  }
};

/**
 * 2. DOM HELPERS & DETECTION
 */
const DomUtils = {
  sleep: (ms) => new Promise(r => setTimeout(r, ms)),

  waitForElement: async (selectors, timeout = CONFIG.MAX_WAIT_MS) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (selectors.some(s => document.querySelector(s))) return true;
      await DomUtils.sleep(100);
    }
    return false;
  },

  getDocId: () => {
    // Try to extract docId from URL
    const fromUrl = window.location.href.match(/docid\/(\d+)/);
    if (fromUrl) return fromUrl[1];
    
    // Fallback: try to extract from iframe source in HTML
    const fromFrame = document.documentElement.innerHTML.match(/\/html\/(\d+)\/res\//);
    return fromFrame ? fromFrame[1] : "document";
  }
};

/**
 * 3. BUSINESS LOGIC (CLEANING & EXPORT)
 */
const Exporter = {
  prepareDOMForPrint(pageStart, pageEnd) {
    // 1. Standard UI cleaning
    const toolbars = document.querySelectorAll(".toolbar, #toolbar, .header, .footer, #export-helper-status");
    toolbars.forEach(el => el.remove());

    document.body.style.overflow = "visible";
    const container = document.querySelector("#page-container");
    if (container) {
      container.style.overflow = "visible";
    }

    if(pageStart && pageEnd){
       // 2. Physically remove pages outside the requested range
      const pages = Array.from(document.querySelector("#page-container")?.children || []).filter(el => el.tagName === 'DIV');
      pages.forEach((page, index) => {
        console.log(page, index);
        if (index < pageStart || index > pageEnd) {
          page.remove();
        }
      });
    }
  },

  getCleanHTML: () => {
    let html = document.documentElement.outerHTML;
    // RegEx Cleaning
    html = html.replace(/<div[^>]*id=["']export-helper-status["'][\s\S]*?<\/div>/i, ""); 
    html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
    // Remove specific CSS media queries that hide content
    html = html.replace(/@media\s*screen\s*\{[^}]*\.pc\s*\{\s*display\s*:\s*none\s*;?\s*\}[^}]*\}/gi, "");
    return `<!DOCTYPE html>\n${html}`;
  },

  async processFonts(html, docId) {
    const fontMap = await Messenger.send("get_fonts", { docId });
    for (const [url, data] of Object.entries(fontMap)) {
      // Escape special characters for Regex and replace remote URLs with local font paths
      const relative = new URL(url).pathname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`url\\(\\s*['"]?${relative}['"]?\\s*\\)`, "g");
      html = html.replace(regex, `url(fonts/${data.filename})`);
    }
    return html;
  }
};

/**
 * 4. CORE PROCESS (PIPELINE)
 */
const CaptureEngine = {

  // Main autoScroll implementation with page range support
  async autoScroll(docId, settings) {
    const { scrollSpeed, captureZoom, pageStart, pageEnd } = settings;
    console.log(pageStart)
    console.log(pageEnd)
    const container = document.querySelector("#page-container");
    container.style.zoom = captureZoom;

    let total, start;

    // 1. Handling start position: If specified, jump to page, otherwise stay at top
    if (pageStart) {
      const startEl = document.querySelector(`[data-page-url*="/page/${pageStart}"]`);
      if (startEl) {
        startEl.scrollIntoView({ behavior: "auto", block: "start" });
        await new Promise(r => setTimeout(r, 1000));
      }
      total = document.querySelector(`[data-page-url*="/page/${pageEnd}"]`).offsetTop;
      start = startEl.offsetTop;

    } else {
      total = container.scrollHeight;
      start = 0;
    }

    let lastScrollTop = -1;
    let lastReportedPercent = 0;

    while (true) {
      // 3. Exit conditions
      if (pageEnd) {
        // Case: Specific range -> Stop when the target end page URL is no longer pending (loaded)
        const targetStillPending = document.querySelector(`[data-page-url*="/page/${pageEnd}"]`);
        if (!targetStillPending) break;
      } else {
        // Case: Full book -> Stop when no more scrolling is possible
        if (container.scrollTop <= lastScrollTop) break;
      }

      lastScrollTop = container.scrollTop;
      container.scrollTop += (80 + Math.random() * 10) * scrollSpeed;

      const progress = Math.round(((container.scrollTop - start) / (total - start - container.clientHeight)) * 100);
      console.log(container.scrollTop, start, total, container.clientHeight);
      
      if (progress - lastReportedPercent > 0.5) {
        lastReportedPercent = progress;
        Messenger.updateStatus(docId, 'capture_scrolling', progress);
      }

      await DomUtils.sleep(CONFIG.SCROLL_DELAY_BASE + Math.random() * 100);
    }
    
    container.style.zoom = 1;
  },

  async run(pipeline) {
    const { docId, settings } = pipeline;
    try {
      // Wait for viewer stabilization
      await DomUtils.waitForElement(["#page-container"]);
      await Messenger.updateStatus(docId, 'stabilized_viewer', 'ok');

      // Security pause
      await Messenger.updateStatus(docId, 'security_waiting', 'processing');
      await DomUtils.sleep(5000);
      await Messenger.updateStatus(docId, 'security_waiting', 'ok');

      // Scroll and capture
      await this.autoScroll(docId, settings);
      
      await Messenger.updateStatus(docId, 'capture_scrolling', 100);
      await Messenger.send("scroll_ended", { docId });
      await Messenger.updateStatus(docId, 'fetch_waiting', 'processing');
    } catch (e) {
      console.error("Pipeline Error:", e);
      Messenger.updateStatus(docId, 'error', e.message);
    }
  }
};

/**
 * 5. ENTRY POINT & LISTENERS
 */
browser.runtime.onMessage.addListener(async (msg) => {
  const { action, state, docId, mode, pageStart, pageEnd } = msg;
  console.log(pageStart);

  if (action !== "start") return;

  // Phase 1: Initialization & Redirection
  if (state === 'ready_to_begin') {
    const iframe = document.querySelector("iframe[id*='player']");
    if (iframe) {
      const currentId = DomUtils.getDocId();
      await Messenger.send("initialize_document", {
        docId: currentId,
        completeDomain: window.location.origin,
        shortDomain: window.location.origin.split(".").slice(-2).join(".")
      });
      // Redirect to the reader iframe source directly
      window.location.href = iframe.src;
    }
    return;
  }

  // Phase 2: Final Export
  if (state === "ready_to_export") {
    try {
      Exporter.prepareDOMForPrint(pageStart, pageEnd);
      
      if (mode === "html" || mode === "both") {
        let html = Exporter.getCleanHTML();
        html = await Exporter.processFonts(html, docId);
        await Messenger.updateStatus(docId, 'html_generated', 'processing');
        Messenger.send("export_html_zip", { html, docId });
      }

      if (mode === "pdf" || mode === "both") {
        await Messenger.updateStatus(docId, 'pdf_print', 'processing');
        window.print();
      }
      
      Messenger.send("pdf_done", { docId });
    } catch (e) {
      Messenger.updateStatus(docId, 'error', e.message);
    }
  }
});

/**
 * 6. DOWNLOAD BUTTON ON CATALOG PAGE
 */
const PageButtons = {
  async injectDownloadButton() {
    const container = document.querySelector(".buttons ul");
    if (!container) return;

    // Prevent multiple injections
    if (document.querySelector("#btn-download-book")) return;

    const li = document.createElement("li");
    const a = document.createElement("a");

    // Extract docId from catalog URL
    let match = window.location.pathname.match(/docid\/(\d+)/); 
    if (!match){
      match = window.location.pathname.match(/catalog\/book\/(\d+)/)
    }

    if(!match) return;

    const docId = match[1]; 
    const already = await HistoryChecker.isDownloaded(docId); 
  
    const readerUrl = `${window.location.origin}/reader/docid/${docId}`; 

    a.href = "#";
    a.id = "btn-download-book";
    a.title = "Download Book";

    const img = document.createElement("img");
    img.src = browser.runtime.getURL(
      already ? "icons/btn_down_done.png" : "icons/btn_down.png"
    );
    
    a.appendChild(img);
    li.appendChild(a);
    container.appendChild(li);

    // Action: launch pipeline in a new tab
    a.addEventListener("click", (e) => {
      e.preventDefault();
      Messenger.send("auto_start_capture", {
        url: readerUrl
      });
    });

       // Create button
    const b = document.createElement("a");
    b.href = readerUrl;
    b.className = "btn-open";
    b.title = "Open Book Reader";

    const img2 = document.createElement("img");
    img2.src = browser.runtime.getURL("icons/btn_open.png");

    b.appendChild(img2);
    li.appendChild(b);
    container.appendChild(li);
  },

  tryInject() {
    // Only target /catalog/book pages
    if (!((/\/catalog\/book\/docid\/\d+/.test(window.location.pathname)) || (/\/catalog\/book\/\d+/.test(window.location.pathname)))) return;

    // Wait for buttons to exist in DOM
    DomUtils.waitForElement([".buttons ul"]).then(() => {
      console.warn('injecting');
      PageButtons.injectDownloadButton();
    });
  }
};

/**
 * 7. BUTTONS ON SEARCH RESULTS
 */
const SearchResultsButtons = {
  async injectForItem(itemEl) {
    const buttons = itemEl.querySelector(".bookButtons");
    if (!buttons) return;

    if (itemEl.querySelector(".btn-download-search")) return;

    const match = itemEl.id.match(/item-list-(\d+)/);
    if (!match) return;
    const docId = match[1];
    const already = await HistoryChecker.isDownloaded(docId); 
    
    if (itemEl.querySelector(".btn-download-search")) return;

    // Construct reader URL
    const readerUrl = `${window.location.origin}/reader/docid/${docId}`;

    // Create button
    const a = document.createElement("a");
    a.href = "#";
    a.className = "btn-download-search";
    a.title = "Download Book";

    const img = document.createElement("img");
    img.src = browser.runtime.getURL(
      already ? "icons/btn_down_done.png" : "icons/btn_down.png"
    );

    a.appendChild(img);
    buttons.appendChild(a);

    // Action: auto-start pipeline
    a.addEventListener("click", (e) => {
      e.preventDefault();
      Messenger.send("auto_start_capture", { url: readerUrl });
    });

    // Create button
    const b = document.createElement("a");
    b.href = readerUrl;
    b.className = "btn-open";
    b.title = "Open Book Reader";

    const img2 = document.createElement("img");
    img2.src = browser.runtime.getURL("icons/btn_open.png");

    b.appendChild(img2);
    buttons.appendChild(b);
  },

  injectAll() {
    const results = document.querySelector("#results-list");
    if (!results) return;

    const items = results.querySelectorAll(".item");
    items.forEach(item => this.injectForItem(item));
  },

  tryInject() {
    // Only target search pages
    const isSearchPage = /\/catalog\/search\//.test(window.location.pathname);
    if (!isSearchPage) return;

    DomUtils.waitForElement(["#results-list"]).then(() => {
      this.injectAll();

      // Handle dynamic results (pagination, infinite scroll)
      const obs = new MutationObserver(() => this.injectAll());
      obs.observe(document.querySelector("#results-list"), { childList: true, subtree: true });
    });
  }
};

const HistoryChecker = {
  async isDownloaded(docId) {
    const res = await Messenger.send("isDownloaded", { docId });
    return res?.downloaded === true;
  }
};


// Auto-start on load
(async () => {
  console.log('begining');
  PageButtons.tryInject();
  SearchResultsButtons.tryInject();

  // Check if we are inside a Cyberlibris viewer
  const isCyberlibris = await DomUtils.waitForElement(["iframe[id*='player']", "#page-container"]);
  if (isCyberlibris) {
    console.log('suite');
    const docId = DomUtils.getDocId();
    const pipeline = await Messenger.send("getPipelineData", { docId });
    console.log(pipeline);
    if (pipeline?.exportState === "waiting_viewer") {
      CaptureEngine.run(pipeline);
    }
  }
  console.log('fin execution');
})();