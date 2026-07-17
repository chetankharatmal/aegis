// detector.js
// Pure detection logic. No DOM access here so it can be unit tested standalone.

const PII_PATTERNS = [
  { type: "Email", category: "email", regex: /[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}/g },
  { type: "Phone Number", category: "phone", regex: /\b(?:\+?\d{1,2}[\s-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g },
  { type: "Credit Card", category: "financial", regex: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g },
  { type: "SSN / National ID", category: "national_id", regex: /\b\d{3}-\d{2}-\d{4}\b/g },
  { type: "Passport Number", category: "national_id", regex: /\b[A-Z]{1,2}\d{6,9}\b/g },
  { type: "IBAN", category: "financial", regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g },
  { type: "Bank Account (generic)", category: "financial", regex: /\b(?:account|acct)(?:\s*(?:number|no\.?|#))?[\s#:]*\d{8,17}\b/gi },
  { type: "AWS Access Key", category: "credential", regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { type: "Generic API Key / Token", category: "credential", regex: /\b(sk|pk|rk)-[a-zA-Z0-9]{20,}\b/g },
  { type: "Generic Long Secret", category: "credential", regex: /\b[a-zA-Z0-9_-]{32,}\b/g },
  { type: "Crypto Wallet (BTC)", category: "financial", regex: /\b(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,39}\b/g },
  { type: "Crypto Wallet (ETH)", category: "financial", regex: /\b0x[a-fA-F0-9]{40}\b/g },
  { type: "IP Address", category: "network", regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g },
  { type: "Date of Birth", category: "national_id", regex: /\b(?:DOB|date of birth)[\s:]*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/gi }
];

// Keyword-based markers (context clues rather than strict patterns)
const CONFIDENTIAL_KEYWORDS = [
  "confidential", "internal use only", "proprietary", "do not share",
  "not for distribution", "trade secret", "nda", "company secret"
];

const SENSITIVE_FILENAME_KEYWORDS = [
  "resume", "cv", "passport", "ssn", "social security", "salary", "payroll",
  "bank", "tax", "medical", "confidential", "private", "sensitive",
  "contract", "nda", "invoice", "id card", "credentials", "password"
];

// ------------------------------------------------------------------
// Settings support: category toggles + allow-list.
// Default settings shape — used when nothing is stored yet, and to fill
// in any keys missing from a stored (possibly older-version) settings
// object, so upgrades never crash on a missing field.
// ------------------------------------------------------------------
const DEFAULT_SETTINGS = {
  sensitivity: "balanced", // "strict" | "balanced" | "relaxed"
  enabledCategories: {
    email: true,
    phone: true,
    financial: true,
    national_id: true,
    credential: true,
    network: true,
    confidentiality: true,
    filename: true
  },
  allowList: [] // array of lowercase strings (emails, domains, keywords) to ignore
};

function mergeWithDefaults(settings) {
  const merged = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  if (!settings || typeof settings !== "object") return merged;
  merged.sensitivity = settings.sensitivity || merged.sensitivity;
  merged.enabledCategories = { ...merged.enabledCategories, ...(settings.enabledCategories || {}) };
  merged.allowList = Array.isArray(settings.allowList) ? settings.allowList : merged.allowList;
  return merged;
}

// "Relaxed" sensitivity drops the noisiest/most false-positive-prone rule
// (Generic Long Secret) so casual users see fewer false alarms. "Strict"
// keeps everything. This is intentionally simple rather than a numeric score.
function isPatternActiveForSensitivity(patternType, sensitivity) {
  if (sensitivity === "relaxed" && patternType === "Generic Long Secret") {
    return false;
  }
  return true;
}

function isAllowListed(matchedText, allowList) {
  if (!allowList || allowList.length === 0) return false;
  const lower = matchedText.toLowerCase();
  return allowList.some((entry) => entry && lower.includes(entry.toLowerCase()));
}

/**
 * Scans a block of text and returns a summary of what was detected.
 * @param {string} text
 * @param {object} [settings] - optional user settings (category toggles, allow-list, sensitivity)
 */
function scanText(text, settings) {
  if (!text || typeof text !== "string") {
    return { found: false, matches: [] };
  }

  const cfg = mergeWithDefaults(settings);
  const matches = [];

  for (const pattern of PII_PATTERNS) {
    if (cfg.enabledCategories[pattern.category] === false) continue;
    if (!isPatternActiveForSensitivity(pattern.type, cfg.sensitivity)) continue;

    const found = text.match(pattern.regex);
    if (found && found.length > 0) {
      const kept = found.filter((m) => !isAllowListed(m, cfg.allowList));
      if (kept.length > 0) {
        matches.push({ type: pattern.type, count: kept.length });
      }
    }
  }

  if (cfg.enabledCategories.confidentiality !== false) {
    const lowerText = text.toLowerCase();
    const keywordHits = CONFIDENTIAL_KEYWORDS.filter(
      (kw) => lowerText.includes(kw) && !isAllowListed(kw, cfg.allowList)
    );
    if (keywordHits.length > 0) {
      matches.push({ type: "Confidentiality Marker", count: keywordHits.length });
    }
  }

  return { found: matches.length > 0, matches };
}

/**
 * Checks a file name for keywords that suggest sensitive content.
 * @param {string} fileName
 * @param {object} [settings]
 */
function scanFileName(fileName, settings) {
  if (!fileName || typeof fileName !== "string") {
    return { found: false, matches: [] };
  }

  const cfg = mergeWithDefaults(settings);
  if (cfg.enabledCategories.filename === false) {
    return { found: false, matches: [] };
  }

  const nameWithoutExt = fileName.replace(/\.[^/.]+$/, "");
  const normalized = nameWithoutExt.toLowerCase().replace(/[._-]/g, " ");

  const hits = SENSITIVE_FILENAME_KEYWORDS.filter((kw) => {
    if (isAllowListed(kw, cfg.allowList)) return false;
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\b${escaped}\\b`, "i");
    return pattern.test(normalized);
  });

  if (hits.length === 0) {
    return { found: false, matches: [] };
  }

  return {
    found: true,
    matches: [{ type: "Sensitive Filename", count: hits.length, keywords: hits }]
  };
}

// Expose for content.js (classic script, not a module, for MV3 simplicity)
if (typeof module !== "undefined") {
  module.exports = {
    scanText,
    scanFileName,
    PII_PATTERNS,
    CONFIDENTIAL_KEYWORDS,
    SENSITIVE_FILENAME_KEYWORDS,
    DEFAULT_SETTINGS,
    mergeWithDefaults
  };
}
