// Alpine.js (alpine scp friendly) version
document.addEventListener('alpine:init', () => {
  Alpine.data('popupApp', () => ({
    activeTab: 'export',
    exportMode: 'html',
    history: [],
    loadingHistory: false,
    tabId : 0,
    pipelineState : 'end_cycle',
    processing : false,
    showCompletedSteps: false,
    scrollSpeedUI: '10', 
    zoomUI: 1.0,
    themeUI: 'auto',
    queueMaxUI: 2,
    defaultModeUI: "html",
    pageStart: null, 
    pageEnd: null,
    showPageSettings: false,

    settings: {
      scrollSpeed: 10,
      captureZoom: 1.0,
      theme: "auto",
      defaultMode: "html",
      queueMax : 2
    },

    // Helper de traduction
    t(key) { 
      return chrome.i18n.getMessage(key) || key; 
    },

    // Labels de pipeline traduits dynamiquement
    get stepLabels() {
      return {
        security_waiting: {
          label: this.t("step_security_label"),
          description: this.t("step_security_desc")
        },
        stabilized_viewer: {
          label: this.t("step_stabilized_label"),
          description: this.t("step_stabilized_desc")
        },
        capture_scrolling: {
          label: this.t("step_capture_label"),
          description: this.t("step_capture_desc")
        },
        html_generated: {
          label: this.t("step_processing_label"),
          description: this.t("step_processing_desc")
        },
        redirected: {
          label: this.t("step_redirect_label"),
          description: this.t("step_redirect_desc")
        },
        process_launched: {
          label: this.t("step_prep_label"),
          description: this.t("step_prep_desc")
        },
        fetch_waiting: {
          label: this.t("step_download_label"),
          description: this.t("step_download_desc")
        },
        download_asked: {
          label: this.t("step_init_label"),
          description: this.t("step_init_desc")
        },
        pdf_print: {
          label: this.t("step_print_label"),
          description: this.t("step_print_desc")
        }
      };
    },

    async init() {
      // Utilisation de chrome.* pour la compatibilité V2/V3 large
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) this.tabId = tabs[0].id;
        
        if (this.activeTab === 'history') {
          this.loadHistory();
        } else {
          this.loadExportData();
        }
      });

      // Polling périodique pour rafraîchir l'historique
      setInterval(() => {
        if (this.activeTab === 'history') {
          this.loadHistory(true);
        }
      }, 10000);

      chrome.runtime.onMessage.addListener((msg) => {
        if (msg.action === "pipelineUpdate") {
          if (msg.tabId === this.tabId) {
            this.pipelineState = msg.pipeline;
            this.processing = this.pipelineState !== 'end_cycle';
          }
        }
      });
      
      this.loadSettings();
    },

    handleScrollSpeedSelect(event) {
      const value = event.target.value;
      if (value === 'custom') {
        this.scrollSpeedUI = 'custom';
        return;
      }
      this.scrollSpeedUI = value;
      this.settings.scrollSpeed = Number(value);
      this.saveSettings();
    },

    handleCustomScrollSpeed(event) {
      const value = Number(event.target.value);
      if (!isNaN(value)) {
        this.settings.scrollSpeed = value;
        this.saveSettings();
      }
    },

    handleZoom(event) {
      const value = Number(event.target.value);
      if (!isNaN(value)) {
        this.settings.captureZoom = value;
        this.saveSettings();
      }
    },

    handleTheme(event) {
      this.settings.theme = event.target.value;
      this.saveSettings();
    },

    handleQueueMax(event) {
      this.settings.queueMax = event.target.value;
      this.saveSettings();
    },

    handleDefaultMode(event){
      this.settings.defaultMode = event.target.value;
      this.saveSettings();
    },

    async loadSettings() {
      const data = await new Promise(resolve => chrome.storage.local.get('settings', resolve));
      const settings = data.settings || {};
      
      this.settings = {
        scrollSpeed: 10,
        captureZoom: 1.0,
        theme: "auto",
        defaultMode: "html",
        queueMax: 2,
        ...settings
      };

      this.scrollSpeedUI = [1, 3, 10, 20].includes(this.settings.scrollSpeed)
        ? String(this.settings.scrollSpeed)
        : 'custom';
      
      this.zoomUI = this.settings.captureZoom;
      this.themeUI = this.settings.theme;
      this.defaultModeUI = this.settings.defaultMode;
      this.queueMaxUI = this.settings.queueMax;
      this.applyTheme();
    },

    async saveSettings() {
      const cleanSettings = JSON.parse(JSON.stringify(this.settings));
      await new Promise(resolve => chrome.storage.local.set({ settings: cleanSettings }, resolve));
      this.applyTheme();
    },

    applyTheme() {
      const theme = this.settings.theme;
      const isDark =
        theme === "dark" ||
        (theme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);

      document.documentElement.classList.toggle("dark", isDark);
    },

    resetPagesValues(){
      this.pageStart = null;
      this.pageEnd = null;
    },

    async submitExport() {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const url = tabs[0]?.url;
        const match = url.match(/docid\/(\d+)/);
        const id = match ? match[1] : null;

        chrome.runtime.sendMessage({ 
          action: 'setExportMode', 
          mode: this.exportMode, 
          scrollSpeed: this.settings.scrollSpeed, 
          captureZoom: this.settings.captureZoom,  
          url: url, 
          docId: id,
          pageStart: this.pageStart ? Number(this.pageStart) : null, 
          pageEnd: this.pageEnd ? Number(this.pageEnd) : null,
        }, () => {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'start', state: 'ready_to_begin' });
        });
      });
    },

    setTab(tab) {
      this.activeTab = tab;
      if (tab === 'history') {
        this.loadHistory();
      }
    },

    async loadHistory(update = false) {
      if(!update) this.loadingHistory = true;
      
      const data = await new Promise(resolve => chrome.storage.local.get('history', resolve));
      this.history = data.history || [];

      if(!update) this.loadingHistory = false;
    },

    async loadExportData(){
      chrome.runtime.sendMessage({
        action: "getPipelineState",
        tabId : this.tabId
      }, (response) => {
        this.pipelineState = response;
        if(this.pipelineState && this.pipelineState !== 'end_cycle'){
          this.processing = true;
        }
      });
    },

    openBookUrl(url) {
      if (url) chrome.tabs.create({ url });
    },

    async deleteHistoryItem(exportedAt) {
      this.history = this.history.filter(item => item.exportedAt !== exportedAt);
      const safeHistory = this.history.map(item => JSON.parse(JSON.stringify(item)));
      await new Promise(resolve => chrome.storage.local.set({ history: safeHistory }, resolve));
    },

    formatBadgeText(state) {
      return state ? state.toUpperCase() : '';
    },

    formatAuthors(authors) {
      return authors && authors.length ? authors.join(', ') : this.t('unknown_author');
    },

    formatDate(date) {
      // Utilise la locale du navigateur pour le format de date automatique
      return new Date(date).toLocaleDateString(chrome.i18n.getUILanguage());
    }
  }));
});