# Permissions audit for Cyberlibris Export Helper

This document explains, line by line, why each permission in `manifest.json` is required and how it is used.



## Core extension permissions

### `activeTab`

**Why it is needed:**  
Used to interact with the currently active tab when the user clicks the extension icon.

**How it is used:**

- Detect the current tab displaying the ScholarVox/Cyberlibris viewer.
- Initiate the export pipeline from the popup/background for that tab.


### `tabs`

**Why it is needed:**

- To query information about the current tab.
- To send messages between background and content scripts.
- To track the lifecycle of the viewer tab (loading, closing).

**How it is used:**

- Check whether the current tab matches a supported viewer domain.
- Coordinate export progress and status updates.


### `storage`

**Why it is needed:**

- To persist user preferences and local history.

**How it is used:**

- Store export settings (scroll speed, zoom level, theme).
- Store a local history of completed exports (titles, timestamps).
- Optionally store user‑entered proxy domains (for configuration only).


All data remains local to the browser.



### `downloads`

**Why it is needed:**

- To save the generated export files to the user’s machine.

**How it is used:**

- Trigger the download of:
  - ZIP archives containing HTML exports.
  - PDF files generated from the viewer.

Downloads are always initiated as a direct result of user action.



### `webRequest` and `webRequestBlocking`

**Why they are needed:**

- To observe network activity of the viewer.
- To capture font resources required for correct rendering in exports.
- To know when all pages/resources have finished loading before exporting.

**How they are used:**

- Listen to requests made by the viewer pages.
- Detect when fonts and page resources are fully loaded.
- Coordinate the export pipeline timing.

**What they do NOT do:**

- No modification, blocking, or redirection of requests.
- No injection of headers or alteration of responses.
- No tracking of user browsing outside the supported domains.

`webRequestBlocking` is required by Firefox to intercept certain resource types, even though the extension does not alter them.



## Host permissions (domains)

The extension is intentionally restricted to a small set of domains directly related to ScholarVox/Cyberlibris and a few institutional proxies.

### `https://*.scholarvox.com/*`

**Why it is needed:**

- ScholarVox’s public viewer is served under this domain.
- The content script must be injected here to interact with the viewer.


### `https://*.cyberlibris.com/*`

**Why it is needed:**

- CyberLibris infrastructure and viewer instances may be served under this domain.
- Required for the same reasons as `*.scholarvox.com`.


### Institutional proxy domains

Examples (as in the manifest):

- `https://univ-scholarvox-com.gorgone.univ-toulouse.fr/*`
- `https://univ-scholarvox-com.bnf.idm.oclc.org/*`
- `https://univ-scholarvox-com.ressources.univ-poitiers.fr/*`

**Why they are needed:**

- Many universities access ScholarVox through institution‑specific proxy domains.
- These proxies are necessary for the extension to function in those institutional environments.

**How they are used:**

- Inject the same `content_script.js` into the proxied viewer pages.
- Coordinate the export pipeline exactly as on the public domains.

