function createHistoryItem({ 
  id, 
  title, 
  authors, 
  domain, 
  url, 
  cover, 
  state 
}) {
  return {
    id,
    title,
    // Ensure authors is always an array
    authors: Array.isArray(authors) ? authors : (authors ? [authors] : []),
    domain,
    url,
    state, // "processing", "pdf", "zip", "both"
    exportedAt: Date.now(),
    cover
  };
}

async function addToHistory(item) {
  // Retrieve existing history and add the new item to the beginning of the list
  const { history = [] } = await browser.storage.local.get("history");
  history.unshift(item);
  await browser.storage.local.set({ history });
}

async function getHistory(){
  // Fetch the full history object from local storage
  return (await browser.storage.local.get("history")).history;
}

async function updateHistoryItem(id, updates) {
  const store = await browser.storage.local.get("history");
  const history = store.history || [];

  // Find the index of the specific item to update
  const index = history.findIndex(h => h.id === id);
  if (index === -1) return;

  // Merge existing item data with new updates
  history[index] = { ...history[index], ...updates };

  await browser.storage.local.set({ history });
}


function extractDomainFromUrl(url) {
  // Extract the main domain (e.g., "example.com") from a full URL
  const hostname = new URL(url).hostname;
  const parts = hostname.split(".");
  return parts.slice(-2).join(".");
}

async function urlToDataUri(url) {
  // 1. Fetch data from the URL
  const response = await fetch(url, {
      method: 'GET',
      mode: 'cors', // Force le mode cors pour utiliser les permissions de l'extension
      credentials: 'include' // Très important pour passer à travers le proxy (cookies)
    });
    
  const blob = await response.blob();

  // 2. Read the "Blob" as a Data URL (Base64) to store it locally
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}