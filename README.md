# AEGIS — AI Exposure Guard & Interception System

A two-part proof-of-concept built for the research project **"The Invisible
Leak: How Generative AI Usage Can Unintentionally Expose Sensitive
Organizational Data."**

1. **Browser extension** (this folder) — warns you before you send
   sensitive/confidential data into ChatGPT, Claude, Gemini, or Copilot via
   the chat input box or a file upload, with both an in-page warning and a
   native desktop notification.
2. **Clipboard watcher** (`python-watcher/` folder) — a Python background
   script that warns you the moment you *copy* sensitive data from anywhere
   (email, spreadsheet, internal doc), before it's even pasted.

Together they cover two different leak vectors: direct typing/pasting/file
upload into the AI chat window, and copying sensitive data in the first
place. See `python-watcher/README.md` for the Python component's setup.

## What it detects
- Emails, phone numbers
- Credit card numbers, IBAN, generic bank account numbers
- Crypto wallet addresses (BTC, ETH)
- SSNs/national IDs, passport numbers, dates of birth
- AWS access keys, generic API keys/tokens, long secret-looking strings
- IP addresses
- Confidentiality keywords ("confidential", "internal use only", "NDA", etc.)
- Sensitive filenames (see below)

All of the above are grouped into categories (`email`, `phone`, `financial`,
`national_id`, `credential`, `network`, `confidentiality`) that can be
individually toggled — see **Settings** below.

## Settings page
Right-click the extension icon → **Options** (or click **Settings** in the
popup dashboard) to configure:

- **Sensitivity level** — Strict (everything on, including the noisiest
  rule), Balanced (recommended default), or Relaxed (drops the
  false-positive-prone "Generic Long Secret" rule).
- **Detection categories** — turn any category on/off independently.
- **Allow-list** — terms AEGIS should ignore (e.g. your own company's email
  domain, or test data you use often). Case-insensitive, substring-based.

Settings are stored via `chrome.storage.local` and take effect immediately
across all tabs (no reload needed) via a `chrome.storage.onChanged` listener.

## Supported AI platforms
| Platform | Status |
|---|---|
| ChatGPT (chatgpt.com / chat.openai.com) | Verified against the live site |
| Claude (claude.ai) | Verified against the live site |
| Gemini (gemini.google.com) | Best-effort, unverified — selectors may need updating (see `content.js` comments) |
| Microsoft Copilot (copilot.microsoft.com) | Best-effort, unverified — selectors may need updating (see `content.js` comments) |

Gemini and Copilot use custom, frequently-changing DOM structures. If
detection doesn't trigger there, open DevTools, inspect the actual input/send
elements, and update `SITE_CONFIG` in `content.js`.

## File upload scanning
Files attached to any supported platform are scanned in two complementary ways:

1. **Content scanning** — for `.txt`, `.csv`, `.json`, `.md`, `.log`, `.pdf`
   (via a bundled copy of pdf.js), `.docx` (via mammoth.js), and `.xlsx`
   (via SheetJS, all sheets converted to CSV before scanning) — the actual
   file contents are extracted and run through the same detection rules used
   for typed text.
2. **Filename scanning** — runs on **every** attached file, regardless of
   type or whether content scanning succeeded. If the filename itself
   contains a term like "resume", "passport", "confidential", "salary",
   "nda", "bank", etc., it's flagged. This matters even for supported types:
   a real resume's *content* rarely matches any PII pattern, but the
   filename still gives it away. It's also what catches genuinely
   unsupported types (images, etc.) that can't be content-scanned at all.

Filename matching uses word-boundary regex, not plain substring matching, to
avoid false positives (e.g. "cvs_pharmacy_receipt.pdf" does **not** trigger
the "cv" keyword).

When something is flagged, you get **two alerts at once**:
1. An in-page warning overlay listing which file(s) and what was found, with
   the option to remove the file(s) or upload anyway.
2. A native OS-level desktop notification (the "alert pop") — this fires
   even if you're not looking at the tab, or if the overlay is missed.

**Still not supported: images (screenshots, scanned documents).** These would
require OCR (e.g. `tesseract.js`), which adds real complexity and latency —
documented here as future work. The filename heuristic above still provides
partial coverage (e.g. `passport_scan.png` gets flagged by name).

## Reporting
The popup dashboard (click the toolbar icon) shows:
- A 7-day summary: total warnings, split by source (typed/pasted text vs.
  file uploads) and by outcome (sent/uploaded anyway vs. edited/removed).
- A bar-chart breakdown by data type.
- An **Export CSV** button — downloads a timestamped CSV of all recent
  events (timestamp, site, source, action, detected types) for use in a
  report or further analysis.
- A **Clear log** button to reset stored events.

## How to install (unpacked, for testing/demo)
1. Open Chrome and go to `chrome://extensions`
2. Turn on **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select this folder
5. Go to chatgpt.com or claude.ai and try typing something like:
   `My email is john@company.com and my SSN is 123-45-6789`
   then press Enter — you should see a warning overlay.
6. To test file scanning: attach any file from `test-files/` via the chat's
   file upload button — you should see a warning overlay AND a desktop
   notification for anything except the files marked "clean" in
   `test-files/README.md`.
7. Chrome will ask for notification permission the first time an alert
   fires — allow it, or you'll only see the in-page overlay.
8. To configure settings: right-click the extension icon → **Options**, or
   click **Settings** in the popup dashboard.

## How to test the detection logic standalone
```
node test_detector.js
```
Runs the regex/keyword rules — including the new PII types and settings
behavior (category toggles, sensitivity presets, allow-list) — against
sample text without needing the browser.

## Project structure
- `manifest.json` — extension config (Manifest V3)
- `detector.js` — pure detection logic (regex + keyword matching, settings support)
- `content.js` — watches chat inputs and file uploads across all supported
  platforms, intercepts submission, shows the warning overlay, sends desktop
  alerts, and logs events
- `background.js` — service worker that raises native OS notifications
- `options.html` / `options.js` — the settings page
- `popup.html` / `popup.js` — the toolbar dashboard (summary, chart, CSV export)
- `overlay.css` — styling for the warning popup
- `libs/` — bundled third-party libraries (pdf.js, mammoth.js, SheetJS) —
  loaded locally since extensions can't fetch code from a remote CDN
- `test_detector.js` — standalone tests for the detection logic
- `test-files/` — sample files (all fake/synthetic data) for demoing every feature

## Known limitations (good to mention in your write-up)
- Detection is regex/keyword-based, not context-aware — it will have false
  positives (e.g. long order numbers matching "Generic Long Secret", mitigated
  by the Relaxed sensitivity setting) and false negatives (sensitive data
  phrased without a recognizable pattern, like "the client's home address is
  42 Oak Street").
- Site DOM selectors in `content.js` may break if any platform updates its
  UI — this is a real-world maintenance challenge worth discussing in your
  research findings. Gemini/Copilot selectors are unverified best-effort.
- Images are not content-scanned (no OCR) — only caught if the filename is
  suspicious.
- When a flagged file is "removed," the extension clears the file input, but
  the site's own UI (e.g. a file preview chip) may not always update in sync
  — a real constraint of not controlling the site's own JavaScript state.
- This only protects against the *input* leak vector, not what the AI model
  itself might do with data already in its training set or memory.
- The allow-list is intentionally simple (substring match) — it can't express
  more complex rules like "only allow this domain in the 'to' field."

## Suggested next steps for your research paper
1. Run a small user test: have a few people use it for a week and track how
   many warnings triggered and how many were "sent anyway."
2. Measure false positive rate on a sample of ~50 realistic non-sensitive
   prompts, at each sensitivity level, to show the trade-off concretely.
3. Use the popup dashboard's CSV export as your raw "risk report" data for
   the paper.
