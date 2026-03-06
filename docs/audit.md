
This document provides a complete and transparent overview of the extension’s architecture, permissions, security model, and operational scope.

## 1. Purpose of the Extension

Cyberlibris Export Helper automates the export of the Cyberlibris / ScholarVox online book viewer.  
The extension is used in academic contexts where universities access ScholarVox through institutional proxy domains.

The extension enables users to:

- capture pages from the viewer,
- generate an HTML or PDF export,
- simplify access to course materials for students and researchers.

The extension **does not bypass authentication**.  
It only operates **after** the user has legitimately logged in through their institution.



## 2. How the Extension Works

### Content Script Injection  
The content script (`content_script.js`) is injected only on:

- public ScholarVox and Cyberlibris domains,
- a small number of known institutional proxy domains explicitly listed in the manifest.

No broad wildcards or unrelated domains are targeted.

### Network Monitoring  
The background script uses `webRequest` to:

- detect when the viewer has finished loading,
- track network activity to determine when it is safe to export,
- capture font files required for PDF generation.

No requests are modified, blocked, or redirected.

### Export Pipeline  
The export process:

- scrolls the viewer to load all pages,
- waits for network inactivity,
- collects fonts,
- generates a ZIP (HTML export) or triggers PDF printing.

All processing happens **locally**.  
No data is transmitted externally.



## 3. Permission Justification

### `activeTab`
Used to interact with the current tab when the user activates the extension.

### `tabs`
Required to:

- open a new tab for the viewer,
- detect when the viewer finishes loading,
- communicate with the content script.

### `storage`
Stores:

- user settings (scroll speed, zoom),
- local export history,

No data leaves the user’s device.

### `downloads`
Used to save:

- generated ZIP archives,
- generated PDFs.

### `webRequest` and `webRequestBlocking`
Used exclusively to:activity

- detect viewer network activity (because some has many fonts and we want to exoort once they are loaded),
- capture font files as they are loaded.

The extension **does not** modify, block, or redirect any request.  
`webRequestBlocking` is required by Firefox to intercept certain resource types.

### Host Permissions
The extension declares:

- public ScholarVox and Cyberlibris domains,
- a small number of institutional proxy domains required for correct operation.

These proxies are used by universities to access ScholarVox.  
They must be listed explicitly because Firefox requires host permissions for any domain where a content script is injected.

No generic or overly broad wildcards are used.



## 4. Security and Privacy

### No Data Collection  
The extension:

- does not collect personal data,
- does not send data to external servers,
- does not read cookies,
- does not modify network traffic.

All operations occur locally.

### Limited Scope  
The extension only interacts with ScholarVox/Cyberlibris viewer pages.  
It cannot access unrelated websites.

### Transparent Code  
The full source code is available in the repository.  
A GitHub Actions workflow builds the extension automatically, ensuring reproducibility and integrity.



## 5. Why Proxy Domains Are Listed in the Manifest

Many universities access ScholarVox through institution‑specific proxy domains.  
These domains:

- do not follow a predictable naming pattern,
- cannot be covered by a valid Manifest V2 wildcard,
- must be explicitly listed for Firefox to allow content script injection.

Firefox requires that **every domain where a script is injected** be declared in the manifest.  
Therefore, a small number of known proxies are included.

The extension remains on Manifest V2 because Firefox does not yet fully support the APIs required for a Manifest V3 migration (notably `webRequestBlocking`).

## 6. Summary

The extension:

- is limited to a legitimate academic use case,
- does not collect or transmit data,
- uses only the permissions strictly required,
- injects scripts only on clearly defined ScholarVox-related domains,
- provides full transparency through open-source code and reproducible builds.

It is designed to be safe, privacy‑respecting, and compliant with Mozilla’s extension policies.

