# Changelog

## v1.4.1
- Fixed: `popup.js` had a working `exportToCSV()` function and bar-chart rendering code with no matching button/CSS in `popup.html` — wired up the "Export CSV" button, added a "Settings" link to the options page, and added the missing `.bar-row`/`.bar-track`/`.bar-fill` CSS.
- Fixed: Python `detector.py` and `generate_report.py` had fallen out of sync with the JS detection engine (missing IBAN/Passport/Crypto/Bank Account patterns and all settings support) — rewrote `detector.py` to match `detector.js` feature-for-feature (categories, sensitivity presets, allow-list, `settings.json`), and added `--csv` export to `generate_report.py`.
- Fixed: `My_Resume_2026.docx` test file was a plain-text placeholder with a `.docx` extension; since `.docx` is now content-scanned, this caused a parse error. Replaced with a genuinely valid, content-clean `.docx` — a better demo anyway, since it shows the filename heuristic catching what content-scanning alone would miss.
- Renamed remaining "AI Leak Guard" branding in `clipboard_watcher.py` and `generate_report.py` to AEGIS.
- Fully rewrote the main `README.md` to match the actual current feature set (it had fallen behind after several rounds of additions).

## v1.4.0
- Expanded detection engine: added IBAN, generic bank account numbers, passport numbers, dates of birth, and BTC/ETH crypto wallet addresses.
- Added a full settings system: sensitivity presets (Strict/Balanced/Relaxed), per-category toggles (email, phone, financial, national_id, credential, network, confidentiality, filename), and a substring-based allow-list — all configurable via a new Options page (`options.html`/`options.js`) and stored in `chrome.storage.local`.
- Added Word (`.docx`, via mammoth.js) and Excel (`.xlsx`, via SheetJS) content scanning, alongside the existing PDF support.
- Added experimental (unverified) support for Gemini and Microsoft Copilot, alongside the verified ChatGPT/Claude support.
- Added CSV export to the popup dashboard's reporting view.

## v1.3.0
- Added filename-based sensitivity detection: every attached file is now checked against a keyword list (resume, cv, passport, salary, confidential, nda, bank, etc.), regardless of whether its contents can be scanned.
- This closes a real gap: previously, unsupported file types (.docx, .xlsx, images) were uploaded completely unchecked. Now a suspicious filename alone (e.g. "resume.docx", "passport_scan.png") triggers a warning.
- Filename matching uses word-boundary regex to avoid false positives (e.g. "cvs_pharmacy_receipt.pdf" does not match the "cv" keyword).
- Added `scanFileName()` to the shared detection engine (`detector.js`), with its own test coverage in `test_detector.js`.
- Updated the warning overlay to display which specific keyword(s) triggered a filename-based flag.

## v1.2.1
- Fixed: PDF files were silently not being scanned in the actual browser extension. Root cause: pdf.js was configured to load its parsing work on a separate Worker thread via a `chrome-extension://` URL, which can be blocked or hang silently depending on the site's CSP and browser version — pdf.js doesn't always surface a clear error when that happens.
- Fix: PDF parsing now runs with `disableWorker: true`, on the main thread, removing the cross-origin worker entirely. Slightly slower for very large PDFs, but reliable.
- Removed the now-unnecessary `pdf.worker.js` file and its `web_accessible_resources` manifest entry.
- Added clearer console diagnostics: if `pdfjsLib` fails to load, or a specific file fails to parse, this is now logged explicitly instead of failing silently.

## v1.2.0
- Renamed project to AEGIS (AI Exposure Guard & Interception System)
- Added PDF file scanning — text is extracted via a bundled copy of pdf.js and run through the same detection engine
- Added native OS-level desktop notifications ("alert pop") for file-upload warnings, in addition to the existing in-page overlay, via a new background service worker
- Added `notifications` permission and `background.js` service worker to manifest

## v1.1.0
- Added file upload scanning for `.txt`, `.csv`, `.json`, `.md`, `.log` attachments on ChatGPT/Claude
- Popup dashboard now breaks down warnings by source (typed/pasted text vs. file uploads)
- Popup now displays the current version number (pulled from `manifest.json`)
- Python clipboard watcher versioned separately, printed on startup

## v1.0.0
- Initial release
- Real-time detection on ChatGPT and Claude chat input (emails, phone numbers, credit cards, SSNs, API keys, IP addresses, confidentiality keywords)
- Warning overlay with "Edit message" / "Send anyway" options
- Local event logging via `chrome.storage.local`
- Popup dashboard with 7-day summary
- Companion Python clipboard watcher with desktop notifications and JSON report generator
