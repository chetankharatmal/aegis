// content.js
// Runs on chatgpt.com, chat.openai.com, and claude.ai
// Watches the prompt input, intercepts submission, and shows a warning
// overlay if sensitive data is detected.

(function () {
  const host = window.location.hostname;

  // Per-site selectors. These may need updating if the sites change their DOM.
  //
  // IMPORTANT: chatgpt.com / chat.openai.com / claude.ai selectors below were
  // verified against the live sites. The gemini.google.com and
  // copilot.microsoft.com entries are BEST-EFFORT and UNVERIFIED — these
  // sites use custom elements and their DOM structure changes often. If
  // detection doesn't trigger on those two sites, open DevTools, inspect the
  // actual input/send-button elements, and update the selectors below.
  const SITE_CONFIG = {
    "chatgpt.com": {
      inputSelector: "#prompt-textarea",
      sendButtonSelector: '[data-testid="send-button"]'
    },
    "chat.openai.com": {
      inputSelector: "#prompt-textarea",
      sendButtonSelector: '[data-testid="send-button"]'
    },
    "claude.ai": {
      inputSelector: 'div[contenteditable="true"]',
      sendButtonSelector: 'button[aria-label="Send message"]'
    },
    "gemini.google.com": {
     
      inputSelector: 'rich-textarea div[contenteditable="true"]',
      sendButtonSelector: 'button[aria-label="Send message"]'
    },
    "copilot.microsoft.com": {
     
      inputSelector: 'textarea[id="userInput"], textarea[data-testid="chat-input"]',
      sendButtonSelector: 'button[data-testid="submit-button"], button[aria-label="Submit"]'
    }
  };

  const config = SITE_CONFIG[host];
  if (!config) return;

  // ------------------------------------------------------------------
  // Settings cache. Loaded once on startup and kept fresh via
  // chrome.storage.onChanged, so the (synchronous) scan calls below don't
  // need to await a storage read on every keystroke/file selection.
  // ------------------------------------------------------------------
  let cachedSettings = null; // null until first load completes; scanText/scanFileName treat null the same as "use defaults"

  chrome.storage.local.get({ aegisSettings: null }, (data) => {
    cachedSettings = data.aegisSettings;
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.aegisSettings) {
      cachedSettings = changes.aegisSettings.newValue;
    }
  });

  let pendingBypass = false; // true once user clicks "Send Anyway"

  function getInputText(inputEl) {
    if (!inputEl) return "";
    // textarea vs contenteditable div
    return inputEl.value !== undefined ? inputEl.value : inputEl.innerText;
  }

  function findInput() {
    return document.querySelector(config.inputSelector);
  }

  function findSendButton() {
    return document.querySelector(config.sendButtonSelector);
  }

  function logEvent(matches, action) {
    chrome.storage.local.get({ events: [] }, (data) => {
      const events = data.events;
      events.push({
        timestamp: Date.now(),
        site: host,
        types: matches.map((m) => m.type),
        action // "warned_edited" | "warned_sent_anyway"
      });
      // keep last 500 events to avoid unbounded growth
      const trimmed = events.slice(-500);
      chrome.storage.local.set({ events: trimmed });
    });
  }

  function buildOverlay(matches, onEdit, onSendAnyway) {
    const existing = document.getElementById("aileak-overlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "aileak-overlay";

    const box = document.createElement("div");
    box.id = "aileak-box";

    const title = document.createElement("div");
    title.id = "aileak-title";
    title.textContent = "⚠️ Possible sensitive data detected";
    box.appendChild(title);

    const list = document.createElement("ul");
    list.id = "aileak-list";
    matches.forEach((m) => {
      const li = document.createElement("li");
      li.textContent = `${m.type} (${m.count})`;
      list.appendChild(li);
    });
    box.appendChild(list);

    const note = document.createElement("div");
    note.id = "aileak-note";
    note.textContent =
      "This looks like it may contain confidential or personal data. Review before sending.";
    box.appendChild(note);

    const btnRow = document.createElement("div");
    btnRow.id = "aileak-btn-row";

    const editBtn = document.createElement("button");
    editBtn.textContent = "Edit message";
    editBtn.id = "aileak-edit-btn";
    editBtn.onclick = () => {
      overlay.remove();
      onEdit();
    };

    const sendBtn = document.createElement("button");
    sendBtn.textContent = "Send anyway";
    sendBtn.id = "aileak-send-btn";
    sendBtn.onclick = () => {
      overlay.remove();
      onSendAnyway();
    };

    btnRow.appendChild(editBtn);
    btnRow.appendChild(sendBtn);
    box.appendChild(btnRow);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  function triggerRealSend(inputEl) {
    // Re-dispatch the send action after user confirms "Send Anyway"
    pendingBypass = true;
    const sendBtn = findSendButton();
    if (sendBtn) {
      sendBtn.click();
    } else {
      // fallback: simulate Enter key
      inputEl.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          bubbles: true
        })
      );
    }
    pendingBypass = false;
  }

  function interceptSubmit(event, inputEl) {
    if (pendingBypass) return; // allow the programmatic resend through

    const text = getInputText(inputEl);
    const result = scanText(text, cachedSettings);

    if (!result.found) return; // nothing suspicious, let it send normally

    // Block the original submit
    event.preventDefault();
    event.stopImmediatePropagation();

    buildOverlay(
      result.matches,
      () => {
        logEvent(result.matches, "warned_edited");
        inputEl.focus();
      },
      () => {
        logEvent(result.matches, "warned_sent_anyway");
        triggerRealSend(inputEl);
      }
    );
  }

  function attachListeners() {
    const input = findInput();
    const sendBtn = findSendButton();

    if (input && !input.dataset.aileakAttached) {
      input.dataset.aileakAttached = "true";
      input.addEventListener(
        "keydown",
        (e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            interceptSubmit(e, input);
          }
        },
        { capture: true }
      );
    }

    if (sendBtn && !sendBtn.dataset.aileakAttached) {
      sendBtn.dataset.aileakAttached = "true";
      sendBtn.addEventListener(
        "click",
        (e) => {
          const currentInput = findInput();
          interceptSubmit(e, currentInput);
        },
        { capture: true }
      );
    }
  }

  // These sites are single-page apps that re-render the DOM frequently,
  // so we watch for changes and re-attach listeners as needed.
  const observer = new MutationObserver(() => attachListeners());
  observer.observe(document.body, { childList: true, subtree: true });

  attachListeners();

  // ------------------------------------------------------------------
  // File upload scanning
  // Supported: .txt, .csv, .json, .md, .log (plain text via FileReader),
  // .pdf (via pdf.js), .docx (via mammoth.js), and .xlsx (via SheetJS).
  // Images are NOT scanned — see README for why and what it would take
  // to add them (OCR).
  // ------------------------------------------------------------------

  // Configure pdf.js. We deliberately DISABLE the separate worker thread
  // (disableWorker: true below) instead of relying on GlobalWorkerOptions.
  // Loading the pdf.js worker cross-origin from a chrome-extension:// URL
  // inside a content script is a common source of silent failures — the
  // Worker constructor can be blocked or hang depending on the site's CSP
  // and the browser version, and pdf.js doesn't always surface a clear
  // error when that happens (it just never resolves, so the file quietly
  // never gets flagged). Running on the main thread avoids that class of
  // bug entirely, at the cost of briefly blocking the page while a PDF is
  // parsed — an acceptable trade-off for the file sizes this tool handles.
  if (typeof pdfjsLib === "undefined") {
    console.error(
      "[AEGIS] pdfjsLib did not load — PDF scanning will be skipped. " +
      "Check that libs/pdf.js is listed before content.js in manifest.json."
    );
  }
  if (typeof mammoth === "undefined") {
    console.warn("[AEGIS] mammoth.js did not load — .docx scanning will be skipped.");
  }
  if (typeof XLSX === "undefined") {
    console.warn("[AEGIS] xlsx.js did not load — .xlsx scanning will be skipped.");
  }

  const TEXT_EXTENSIONS = [".txt", ".csv", ".json", ".md", ".log"];
  const PDF_EXTENSION = ".pdf";
  const DOCX_EXTENSION = ".docx";
  const XLSX_EXTENSION = ".xlsx";
  const SCANNABLE_EXTENSIONS = [
    ...TEXT_EXTENSIONS,
    PDF_EXTENSION,
    DOCX_EXTENSION,
    XLSX_EXTENSION
  ];

  function hasExtension(file, ext) {
    return file.name.toLowerCase().endsWith(ext);
  }

  function isScannable(file) {
    return SCANNABLE_EXTENSIONS.some((ext) => hasExtension(file, ext));
  }

  function isPdf(file) {
    return hasExtension(file, PDF_EXTENSION);
  }

  function isDocx(file) {
    return hasExtension(file, DOCX_EXTENSION);
  }

  function isXlsx(file) {
    return hasExtension(file, XLSX_EXTENSION);
  }

  function iscsv(file) {
    return hasExtension(file, XLSX_EXTENSION);
  }
  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  async function readPdfAsText(file) {
    if (typeof pdfjsLib === "undefined") {
      throw new Error("pdfjsLib not available");
    }

    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      disableWorker: true, // see note above — avoids cross-origin worker issues
      isEvalSupported: false
    });

    const pdf = await loadingTask.promise;

    let fullText = "";
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item) => item.str).join(" ");
      fullText += pageText + "\n";
    }
    console.info(`[AEGIS] Extracted ${fullText.length} characters from PDF "${file.name}"`);
    return fullText;
  }

  async function readDocxAsText(file) {
    if (typeof mammoth === "undefined") {
      throw new Error("mammoth not available");
    }
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    console.info(`[AEGIS] Extracted ${result.value.length} characters from DOCX "${file.name}"`);
    return result.value;
  }

  async function readXlsxAsText(file) {
    if (typeof XLSX === "undefined") {
      throw new Error("XLSX not available");
    }
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: "array" });

    let fullText = "";
    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      fullText += XLSX.utils.sheet_to_csv(sheet) + "\n";
    });
    console.info(`[AEGIS] Extracted ${fullText.length} characters from XLSX "${file.name}"`);
    return fullText;
  }

  async function extractFileText(file) {
    if (isPdf(file)) return readPdfAsText(file);
    if (isDocx(file)) return readDocxAsText(file);
    if (isXlsx(file)) return readXlsxAsText(file);
    return readFileAsText(file);
  }

  // Sends a real OS-level desktop notification via the background service
  // worker — the "alert pop" — in addition to the in-page overlay, so the
  // warning is visible even if the page overlay is missed or dismissed fast.
  function sendDesktopAlert(title, body) {
    try {
      chrome.runtime.sendMessage({ type: "aegis_alert", title, body });
    } catch (e) {
      console.warn("[AEGIS] Could not send desktop alert:", e);
    }
  }

  function buildFileOverlay(fileResults, onRemoveAll, onUploadAnyway) {
    const existing = document.getElementById("aileak-overlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "aileak-overlay";

    const box = document.createElement("div");
    box.id = "aileak-box";

    const title = document.createElement("div");
    title.id = "aileak-title";
    title.textContent = "⚠️ Sensitive data detected in uploaded file(s)";
    box.appendChild(title);

    const list = document.createElement("ul");
    list.id = "aileak-list";
    fileResults.forEach(({ fileName, matches }) => {
      const fileLi = document.createElement("li");
      const details = matches
        .map((m) =>
          m.type === "Sensitive Filename"
            ? `Sensitive Filename ("${m.keywords.join('", "')}")`
            : `${m.type} (${m.count})`
        )
        .join(", ");
      fileLi.textContent = `${fileName}: ${details}`;
      list.appendChild(fileLi);
    });
    box.appendChild(list);

    const note = document.createElement("div");
    note.id = "aileak-note";
    note.textContent =
      "One or more files you selected may contain confidential or personal data.";
    box.appendChild(note);

    const btnRow = document.createElement("div");
    btnRow.id = "aileak-btn-row";

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "Remove file(s)";
    removeBtn.id = "aileak-edit-btn";
    removeBtn.onclick = () => {
      overlay.remove();
      onRemoveAll();
    };

    const uploadBtn = document.createElement("button");
    uploadBtn.textContent = "Upload anyway";
    uploadBtn.id = "aileak-send-btn";
    uploadBtn.onclick = () => {
      overlay.remove();
      onUploadAnyway();
    };

    btnRow.appendChild(removeBtn);
    btnRow.appendChild(uploadBtn);
    box.appendChild(btnRow);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  function logFileEvent(fileResults, action) {
    chrome.storage.local.get({ events: [] }, (data) => {
      const events = data.events;
      const allTypes = fileResults.flatMap((r) => r.matches.map((m) => m.type));
      events.push({
        timestamp: Date.now(),
        site: host,
        types: allTypes,
        action, // "file_removed" | "file_uploaded_anyway"
        source: "file_upload"
      });
      chrome.storage.local.set({ events: events.slice(-500) });
    });
  }

  async function handleFileInputChange(event) {
    const input = event.target;
    if (!input || input.type !== "file" || !input.files || input.files.length === 0) {
      return;
    }

    const files = Array.from(input.files);
    const fileResults = [];
    const failedFiles = [];

    for (const file of files) {
      // Filename check runs on EVERY file, regardless of type — this is
      // what catches unsupported formats (.docx, images, etc.) that we
      // can't read the contents of, based on a suspicious name alone
      // (e.g. "resume.docx", "passport_scan.png").
      const nameResult = scanFileName(file.name, cachedSettings);
      let combinedMatches = nameResult.found ? [...nameResult.matches] : [];

      if (isScannable(file)) {
        try {
          const text = await extractFileText(file);
          const contentResult = scanText(text, cachedSettings);
          if (contentResult.found) {
            combinedMatches = combinedMatches.concat(contentResult.matches);
          }
        } catch (e) {
          failedFiles.push(file.name);
          console.error(`[AEGIS] Could not read/parse "${file.name}":`, e);
        }
      } else if (!nameResult.found) {
        // Unsupported type and the filename itself wasn't a red flag —
        // note it so this isn't a silent gap, but don't block the upload.
        console.info(
          `[AEGIS] "${file.name}" is an unsupported type for content scanning ` +
          `and its filename didn't match any sensitive keywords — uploaded unchecked.`
        );
      }

      if (combinedMatches.length > 0) {
        fileResults.push({ fileName: file.name, matches: combinedMatches });
      }
    }

    if (failedFiles.length > 0) {
      console.warn(
        `[AEGIS] ${failedFiles.length} file(s) could not be scanned and were let through unchecked: ${failedFiles.join(", ")}`
      );
    }

    if (fileResults.length === 0) return; // nothing flagged, let upload proceed

    // Fire the desktop "alert pop" immediately, in parallel with the
    // in-page overlay below.
    const fileNames = fileResults.map((r) => r.fileName).join(", ");
    sendDesktopAlert(
      "⚠️ AEGIS: Sensitive data detected in file",
      `File(s) flagged: ${fileNames}. Review before uploading.`
    );

    buildFileOverlay(
      fileResults,
      () => {
        // Remove all selected files by clearing the input.
        // Note: this may not perfectly sync with the site's own UI state
        // (it may still show a preview) — a known limitation.
        input.value = "";
        input.dispatchEvent(new Event("change", { bubbles: true }));
        logFileEvent(fileResults, "file_removed");
      },
      () => {
        logFileEvent(fileResults, "file_uploaded_anyway");
        // Files remain selected; nothing further to do since the site's
        // own change handler already has the FileList.
      }
    );
  }

  // Capture phase at the document level so we see the change event before
  // (or alongside) the site's own upload handler.
  document.addEventListener(
    "change",
    (e) => {
      if (e.target && e.target.tagName === "INPUT" && e.target.type === "file") {
        handleFileInputChange(e);
      }
    },
    { capture: true }
  );
})();
