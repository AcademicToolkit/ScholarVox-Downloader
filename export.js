// Use JSZip from './zip.js'
async function fetchAsBlob(url) {
  const res = await fetch(url, { credentials: "include" });
  return await res.blob();
}

/**
 * Creates and downloads a complete ZIP archive for a document.
 *
 * @param {string} docId
 * @param {string} html          // content of index.html
 * @param {Object} metadata      // JS object (including toc, cover, etc.)
 * @param {string|null} coverUrl // URL of the cover (or null)
 * @param {Array<{name: string, url: string}>} fonts // fonts to include
 */
async function createAndDownloadZip(docId, html, metadata, coverUrl, fonts) {
  console.log("[zip] Creating ZIP for", docId);

  const zip = new JSZip();

  // 1) Root files
  zip.file("index.html", html);
  zip.file("metadata.json", JSON.stringify(metadata, null, 2));

  // 2) Cover (optional)
  if (coverUrl) {
    try {
      const coverBlob = await fetchAsBlob(coverUrl);
      zip.file("cover.jpg", coverBlob);
    } catch (e) {
      console.warn("[zip] Failed to retrieve cover:", e);
    }
  }

  // 3) Fonts (optional)
    const fontsFolder = zip.folder("fonts");
    for (const [url, data] of Object.entries(fonts)) {
      try {
        const fontBlob = await fetchAsBlob(url);
        // data.filename might be "Roboto.woff2" or similar
        fontsFolder.file(data.filename, fontBlob);
      } catch (e) {
        console.warn("[zip] Failed to retrieve font", data.filename, ":", e);
      }
    }

  // 4) ZIP Generation
  console.log("[zip] Generating ZIP blob…");
  const zipBlob = await zip.generateAsync({ type: "blob" });

  const zipUrl = URL.createObjectURL(zipBlob);

  try {
    await browser.downloads.download({
      url: zipUrl,
      filename: `${docId}.zip`,
      saveAs: false
    });
    console.log("[zip] ZIP downloaded:", `${docId}.zip`);
  } finally {
    // Revoke URL after 30 seconds to free up memory
    setTimeout(() => URL.revokeObjectURL(zipUrl), 30000);
  }
}