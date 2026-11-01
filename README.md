# AEGIS — AI Exposure Guard & Interception System

A two-part proof-of-concept developed in support of the research project
**"The Invisible Leak: How Generative AI Usage Can Unintentionally Expose
Sensitive Organizational Data."**

1. **Browser extension** (this folder) — detects sensitive or confidential
   data before it is submitted to ChatGPT, Claude, Gemini, or Copilot via
   the chat input or a file upload, and surfaces both an in-page warning
   and a native desktop notification.
2. **Clipboard watcher** (`python-watcher/` folder) — a Python background
   service that flags sensitive data at the moment it is copied from any
   source (email, spreadsheet, internal document), prior to any paste
   action.

Together, these components address two distinct leak vectors: direct
typing, pasting, or file upload into an AI chat interface, and the initial
act of copying sensitive data. See `python-watcher/README.md` for setup
instructions for the Python component.

## 🔍 Detection Coverage
- Email addresses, phone numbers
- Credit card numbers, IBAN, generic bank account numbers
- Cryptocurrency wallet addresses (BTC, ETH)
- SSNs / national ID numbers, passport numbers, dates of birth
- AWS access keys, generic API keys/tokens, and other secret-like strings
- IP addresses
- Confidentiality-related keywords ("confidential," "internal use only,"
  "NDA," etc.)
- Sensitive filenames (see below)

These are organized into independently configurable categories (`email`,
`phone`, `financial`, `national_id`, `credential`, `network`,
`confidentiality`) — see **Settings** below.

## ⚙️ Settings
Access via right-click on the extension icon → **Options**, or **Settings**
in the popup dashboard:

- **Sensitivity level** — Strict (all rules enabled, including the
  higher-false-positive rule), Balanced (recommended default), or Relaxed
  (disables the "Generic Long Secret" rule).
- **Detection categories** — each category can be toggled independently.
- **Allow-list** — user-defined terms AEGIS should disregard (e.g., an
  internal company email domain or recurring test data). Matching is
  case-insensitive and substring-based.

Settings are persisted via `chrome.storage.local` and applied immediately
across all open tabs through a `chrome.storage.onChanged` listener, with no
reload required.

## 🌐 Supported Platforms
| Platform | Status |
|---|---|
| ✅ ChatGPT (chatgpt.com / chat.openai.com) | Verified against the live site |
| ✅ Claude (claude.ai) | Verified against the live site |
| ✅ Gemini (gemini.google.com) | Verified against the live site |
| ✅ Microsoft Copilot (copilot.microsoft.com) | Verified against the live site |

Gemini and Copilot rely on custom DOM structures that change more frequently
than those of ChatGPT and Claude. Should detection fail to trigger on either
platform following a UI update, inspect the input and send elements via
DevTools and update `SITE_CONFIG` in `content.js` accordingly.

## 📎 File Upload Scanning
Files attached on any supported platform are evaluated through two
complementary methods:

1. **Content scanning** — for `.txt`, `.csv`, `.json`, `.md`, `.log`,
   `.pdf` (via a bundled copy of pdf.js), `.docx` (via mammoth.js), and
   `.xlsx` (via SheetJS, with all sheets converted to CSV prior to
   scanning) — extracted file contents are evaluated against the same
   detection rules applied to typed text.
2. **Filename scanning** — applied to every attached file, regardless of
   type or whether content scanning succeeded. Filenames containing terms
   such as "resume," "passport," "confidential," "salary," "nda," or
   "bank" are flagged. This is particularly relevant for file types whose
   content may not match any PII pattern (e.g., a resume) but whose
   filename nonetheless indicates sensitivity, and it is the only
   mechanism available for file types that cannot be content-scanned
   (e.g., images).

Filename matching uses word-boundary regular expressions rather than plain
substring matching, to reduce false positives (e.g., "cvs_pharmacy_receipt.pdf"
does not trigger the "cv" keyword).

When a file is flagged, two notifications are generated:
1. An in-page warning overlay identifying the flagged file(s) and the
   detected data types, with the option to remove the file(s) or proceed.
2. A native OS-level desktop notification, which appears regardless of
   whether the browser tab is in focus or the overlay is dismissed.

**⚠️ Current limitation: images (screenshots, scanned documents) are not
content-scanned.** Reliable coverage would require OCR (e.g.,
`tesseract.js`), which introduces additional complexity and latency; this
is noted as a direction for future work. The filename heuristic described
above provides partial coverage in these cases (e.g., `passport_scan.png`
is flagged by name).

## 📊 Reporting
The popup dashboard, accessed via the toolbar icon, provides:
- A 7-day summary of total warnings, broken down by source (typed/pasted
  text vs. file uploads) and outcome (proceeded vs. edited/removed).
- A bar-chart breakdown by data type.
- An **Export CSV** function that downloads a timestamped record of recent
  events (timestamp, site, source, action, detected types) for reporting
  or further analysis.
- A **Clear log** function to reset stored events.

## 🧪 Installation (Unpacked, for Testing/Demonstration)
1. Open Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** (toggle in the top right).
3. Click **Load unpacked**.
4. Select this folder.
5. Navigate to chatgpt.com or claude.ai and enter a test string such as:
   `My email is john@company.com and my SSN is 123-45-6789`
   then press Enter. A warning overlay should appear.
6. To test file scanning, attach any file from `test-files/` using the
   chat's file upload function. A warning overlay and desktop notification
   should appear for all files except those marked "clean" in
   `test-files/README.md`.
7. Chrome will request notification permission the first time an alert is
   triggered; granting this permission is required for desktop
   notifications (otherwise only the in-page overlay will display).
8. To configure settings, right-click the extension icon and select
   **Options**, or select **Settings** from the popup dashboard.

## ✅ Testing the Detection Logic Independently
```
node test_detector.js
```
Executes the regex/keyword rules — including PII types and settings
behavior (category toggles, sensitivity presets, allow-list) — against
sample text without requiring a browser environment.

## 🗂️ Project Structure
- `manifest.json` — extension configuration (Manifest V3)
- `detector.js` — core detection logic (regex and keyword matching, settings support)
- `content.js` — monitors chat inputs and file uploads across supported
  platforms, intercepts submission, renders the warning overlay, triggers
  desktop alerts, and logs events
- `background.js` — service worker responsible for native OS notifications
- `options.html` / `options.js` — settings page
- `popup.html` / `popup.js` — toolbar dashboard (summary, chart, CSV export)
- `overlay.css` — styling for the warning overlay
- `libs/` — bundled third-party libraries (pdf.js, mammoth.js, SheetJS),
  included locally since extensions cannot load code from a remote CDN
- `test_detector.js` — standalone tests for detection logic
- `test-files/` — sample files (synthetic data only) for demonstrating each feature


