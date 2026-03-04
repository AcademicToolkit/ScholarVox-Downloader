async function scrapeMetadata(docId, domain) {
  const urlMeta = `${domain}/catalog/book/docid/${docId}`;
  const urlToc = `${domain}/catalog/toc/${docId}`;

  console.log("[background] Scraping metadata:", urlMeta);
  console.log("[background] Scraping TOC:", urlToc);

  try {
    // ---------------------------
    // 1) METADATA
    // ---------------------------
    const res = await fetch(urlMeta, { credentials: "include" });
    const html = await res.text();

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    let title = null;
    const titleDiv = doc.querySelector("div.title h2");
    if (titleDiv) {
      title = titleDiv.textContent.trim();
    }

    const right = doc.querySelector("div.right");
    if (!right) {
      console.warn("[background] Unable to find .right — not authenticated?");
      return null;
    }

    // Helper to extract a text field based on a label prefix
    function extractField(label) {
      const p = Array.from(right.querySelectorAll("p"))
        .find(el => el.textContent.trim().startsWith(label + ":"));
      if (!p) return null;
      return p.textContent.replace(label + ":", "").trim();
    }

    // Extract authors from links within the paragraph containing "Auteur"
    const auteursP = Array.from(right.querySelectorAll("p"))
      .find(el => el.textContent.includes("Auteur"));
    const authors = auteursP
      ? Array.from(auteursP.querySelectorAll("a")).map(a => a.textContent.trim())
      : null;

    // ---------------------------
    // 2) TABLE OF CONTENTS (JSON API)
    // ---------------------------
    let toc = [];
    try {
      const resToc = await fetch(urlToc, { credentials: "include" });
      toc = await resToc.json();
    } catch (e) {
      console.warn("[background] Unable to retrieve TOC via API:", e);
    }

    // ---------------------------
    // 3) COVER IMAGE
    // ---------------------------
    let cover = null;

    const coverImg = doc.querySelector("div.center img");
    if (coverImg) {
      cover = coverImg.getAttribute("src");
    }

    // ---------------------------
    // 4) FINAL METADATA OBJECT
    // ---------------------------
    const metadata = {
      id: docId,
      authors,
      title : title,
      editor: extractField("Editeur"),
      year: extractField("Année de Publication"),
      pages: extractField("pages"),
      isbn: extractField("ISBN"),
      eisbn: extractField("eISBN"),
      edition: extractField("Edition"),
      toc, // ← directly includes the JSON from the API
      cover
    };

    console.log("[background] Metadata extracted:", metadata);
    return metadata;

  } catch (err) {
    console.error("[background] Error scraping metadata:", err);
    return null;
  }
}