// detector.js
// AEGIS Detector v2.1
// Pure detection logic. No DOM access.
// API: scanText(text, settings), scanFileName(fileName, settings)
// Set settings.includeRaw = true to get unredacted values in `rawValue`.

"use strict";

// ============================================================
// PATTERN DEFINITIONS
// ============================================================

const PII_PATTERNS = [
  // ---------------- EMAIL ----------------
  {
    type: "Email",
    category: "email",
    confidence: 0.96,
    regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}\b/gi
  },

  // ---------------- PHONE ----------------
  {
    type: "Indian Phone Number",
    category: "phone",
    confidence: 0.93,
    regex: /(?<!\d)(?:\+91[\s.-]?)?(?:0[\s.-]?)?[6-9]\d{4}[\s.-]?\d{5}(?!\d)/g
  },
  {
    // Requires a leading "+" to avoid matching dates / order numbers
    type: "International Phone Number",
    category: "phone",
    confidence: 0.85,
    regex: /(?<![\d+])\+\d{1,3}[\s.-]?(?:\(?\d{2,4}\)?[\s.-]?)\d{3,4}[\s.-]?\d{3,4}(?!\d)/g
  },

  // ---------------- FINANCIAL ----------------
  {
    type: "Credit Card",
    category: "financial",
    confidence: 0.94,
    regex: /(?<!\d)\d(?:[ -]?\d){12,18}(?!\d)/g
  },
  {
    // UPI handles have no dot in the domain part (name@okhdfcbank, name@ybl)
    type: "UPI ID",
    category: "financial",
    confidence: 0.94,
    regex: /\b[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}\b(?!\.[a-zA-Z])/g
  },
  {
    type: "IBAN",
    category: "financial",
    confidence: 0.98,
    regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g
  },
  {
    type: "Bank Account",
    category: "financial",
    confidence: 0.80,
    regex: /\b(?:account|acct)(?:\s+(?:number|no|#))?\s*[:=-]?\s*\d{8,18}\b/gi
  },

  // ---------------- NATIONAL IDS ----------------
  {
    type: "PAN",
    category: "national_id",
    confidence: 0.94,
    regex: /\b[A-Z]{5}\d{4}[A-Z]\b/g
  },
  {
    // First digit is 2-9; Verhoeff checksum verified in validateMatch
    type: "Aadhaar",
    category: "national_id",
    confidence: 0.90,
    regex: /(?<!\d)[2-9]\d{3}[\s-]\d{4}[\s-]\d{4}(?!\d)/g
  },
  {
    type: "SSN / National ID",
    category: "national_id",
    confidence: 0.97,
    regex: /\b\d{3}-\d{2}-\d{4}\b/g
  },
  {
    type: "Passport Number",
    category: "national_id",
    confidence: 0.75,
    regex: /\b[A-Z][A-Z0-9]\d{6,8}\b/g
  },

  // ---------------- CREDENTIALS ----------------
  {
    type: "AWS Access Key",
    category: "credential",
    confidence: 0.99,
    regex: /\bAKIA[0-9A-Z]{16}\b/g
  },
  {
    type: "AWS Temporary Access Key",
    category: "credential",
    confidence: 0.98,
    regex: /\bASIA[0-9A-Z]{16}\b/g
  },
  {
    type: "GitHub Token",
    category: "credential",
    confidence: 0.99,
    regex: /\bgh[pousr]_[A-Za-z0-9_]{20,255}\b/g
  },
  {
    type: "Google API Key",
    category: "credential",
    confidence: 0.99,
    regex: /\bAIza[0-9A-Za-z_-]{35}\b/g
  },
  {
    type: "Slack Token",
    category: "credential",
    confidence: 0.98,
    regex: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g
  },
  {
    type: "JWT",
    category: "credential",
    confidence: 0.99,
    regex: /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g
  },
  {
    type: "Private Key",
    category: "credential",
    confidence: 1.0,
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g
  },
  {
    type: "Generic API Key / Token",
    category: "credential",
    confidence: 0.82,
    regex: /\b(?:sk|pk|rk|api[_-]?key|token)[-_][A-Za-z0-9_-]{16,}\b/gi
  },
  {
    type: "Generic Secret Assignment",
    category: "credential",
    confidence: 0.87,
    regex: /\b(?:password|passwd|pwd|secret|client[_-]?secret|access[_-]?token)\s*[:=]\s*["']?[^\s"'`]{8,}["']?/gi
  },

  // ---------------- CRYPTO ----------------
  {
    type: "Crypto Wallet (BTC)",
    category: "financial",
    confidence: 0.93,
    regex: /\bbc1[a-z0-9]{25,62}\b/g
  },
  {
    type: "Crypto Wallet (BTC)",
    category: "financial",
    confidence: 0.85,
    regex: /\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b/g
  },
  {
    type: "Crypto Wallet (ETH)",
    category: "financial",
    confidence: 0.98,
    regex: /\b0x[a-fA-F0-9]{40}\b/g
  },

  // ---------------- NETWORK ----------------
  {
    type: "IP Address",
    category: "network",
    confidence: 0.82,
    regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g
  },
  {
    type: "IPv6 Address",
    category: "network",
    confidence: 0.85,
    regex: /\b(?:[0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}\b/g
  },

  // ---------------- DOB ----------------
  {
    type: "Date of Birth",
    category: "national_id",
    confidence: 0.90,
    regex: /\b(?:DOB|date\s+of\s+birth|birth\s+date)\s*[:=-]?\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/gi
  },

  // ---------------- GENERIC SECRET ----------------
  {
    type: "Generic Long Secret",
    category: "credential",
    confidence: 0.58,
    regex: /\b[A-Za-z0-9_-]{32,}\b/g
  }
];

// ============================================================
// CONTEXT KEYWORDS
// ============================================================

const CONFIDENTIAL_KEYWORDS = [
  "confidential",
  "internal use only",
  "proprietary",
  "do not share",
  "not for distribution",
  "trade secret",
  "nda",
  "company secret",
  "restricted",
  "private and confidential"
];

const SECRET_CONTEXT_KEYWORDS = [
  "password", "passwd", "pwd", "secret", "api key", "apikey",
  "access token", "auth token", "bearer token", "client secret",
  "private key", "credential"
];

const SENSITIVE_FILENAME_KEYWORDS = [
  "resume", "cv", "passport", "ssn", "social security", "aadhaar",
  "pan card", "salary", "payroll", "bank", "tax", "medical",
  "confidential", "private", "sensitive", "contract", "nda", "invoice",
  "id card", "credentials", "password", "secret", "kyc"
];

// ============================================================
// DEFAULT SETTINGS
// ============================================================

const DEFAULT_SETTINGS = {
  sensitivity: "balanced",
  includeRaw: false,
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
  allowList: []
};

// ============================================================
// SETTINGS MERGE
// ============================================================

function mergeWithDefaults(settings) {
  const merged = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

  if (!settings || typeof settings !== "object") return merged;

  if (["strict", "balanced", "relaxed"].includes(settings.sensitivity)) {
    merged.sensitivity = settings.sensitivity;
  }

  if (settings.includeRaw === true) merged.includeRaw = true;

  if (settings.enabledCategories && typeof settings.enabledCategories === "object") {
    merged.enabledCategories = {
      ...merged.enabledCategories,
      ...settings.enabledCategories
    };
  }

  if (Array.isArray(settings.allowList)) {
    merged.allowList = settings.allowList
      .filter((entry) => typeof entry === "string")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
  }

  return merged;
}

// ============================================================
// HELPERS
// ============================================================

function normalizeText(text) {
  return text.normalize("NFKC").replace(/[\u200B\u200C\u200D\uFEFF]/g, "");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isAllowListed(matchedText, allowList) {
  if (!allowList || allowList.length === 0) return false;

  const lower = matchedText.toLowerCase().trim();

  return allowList.some((entry) => {
    if (!entry) return false;
    if (lower === entry) return true;

    // Email/domain allow-list
    if (lower.includes("@") && (entry.startsWith("@") || entry.includes("."))) {
      return lower.endsWith(entry.startsWith("@") ? entry : `@${entry}`);
    }

    // Avoid tiny substring allow-list entries
    return entry.length >= 6 && lower.includes(entry);
  });
}

function isPatternActiveForSensitivity(patternType, sensitivity) {
  if (sensitivity === "relaxed") {
    return !["Generic Long Secret", "Passport Number", "IPv6 Address"].includes(patternType);
  }
  if (sensitivity === "balanced") {
    return patternType !== "Generic Long Secret";
  }
  return true;
}

// ============================================================
// VALIDATORS
// ============================================================

function isValidIPv4(value) {
  const parts = value.split(".");
  if (parts.length !== 4) return false;

  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    const n = Number(part);
    return n >= 0 && n <= 255;
  });
}

function passesLuhn(value) {
  const digits = value.replace(/\D/g, "");

  if (digits.length < 13 || digits.length > 19) return false;
  if (/^(\d)\1+$/.test(digits)) return false; // 1111..., 0000...

  let sum = 0;
  let doubleDigit = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = Number(digits[i]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }

  return sum % 10 === 0;
}

function passesIbanMod97(value) {
  const iban = value.replace(/\s/g, "").toUpperCase();
  if (iban.length < 15 || iban.length > 34) return false;

  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;

  for (const ch of rearranged) {
    const chunk = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
    for (const digit of chunk) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }

  return remainder === 1;
}

const VERHOEFF_D = [
  [0,1,2,3,4,5,6,7,8,9],
  [1,2,3,4,0,6,7,8,9,5],
  [2,3,4,0,1,7,8,9,5,6],
  [3,4,0,1,2,8,9,5,6,7],
  [4,0,1,2,3,9,5,6,7,8],
  [5,9,8,7,6,0,4,3,2,1],
  [6,5,9,8,7,1,0,4,3,2],
  [7,6,5,9,8,2,1,0,4,3],
  [8,7,6,5,9,3,2,1,0,4],
  [9,8,7,6,5,4,3,2,1,0]
];

const VERHOEFF_P = [
  [0,1,2,3,4,5,6,7,8,9],
  [1,5,7,6,2,8,3,0,9,4],
  [5,8,0,3,7,9,6,1,4,2],
  [8,9,1,6,0,4,3,5,2,7],
  [9,4,5,3,1,2,6,8,7,0],
  [4,2,8,6,5,7,3,9,0,1],
  [2,7,9,3,8,0,6,4,1,5],
  [7,0,4,6,9,1,3,2,5,8]
];

function passesVerhoeff(value) {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 12) return false;

  let c = 0;
  const reversed = digits.split("").reverse();

  for (let i = 0; i < reversed.length; i++) {
    c = VERHOEFF_D[c][VERHOEFF_P[i % 8][Number(reversed[i])]];
  }

  return c === 0;
}

function validateMatch(pattern, match) {
  switch (pattern.type) {
    case "Credit Card":  return passesLuhn(match);
    case "IP Address":   return isValidIPv4(match);
    case "IPv6 Address": return match.includes(":");
    case "IBAN":         return passesIbanMod97(match);
    case "Aadhaar":      return passesVerhoeff(match);
    default:             return true;
  }
}

// ============================================================
// CONFIDENCE
// ============================================================

function looksLikeCredentialContext(text, matchIndex) {
  const start = Math.max(0, matchIndex - 80);
  const end = Math.min(text.length, matchIndex + 80);
  const context = text.slice(start, end).toLowerCase();
  return SECRET_CONTEXT_KEYWORDS.some((keyword) => context.includes(keyword));
}

function calculateConfidence(pattern, text, match, index) {
  let confidence = pattern.confidence;

  if (pattern.category === "credential" && looksLikeCredentialContext(text, index)) {
    confidence += 0.10;
  }

  if (pattern.type === "Generic Long Secret") {
    confidence = looksLikeCredentialContext(text, index) ? 0.88 : 0.48;

    if (/^[a-f0-9]{32,64}$/i.test(match)) confidence -= 0.12; // hash-like

    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(match)) {
      confidence -= 0.20; // UUID
    }
  }

  return Math.max(0, Math.min(1, confidence));
}

// ============================================================
// OVERLAP HANDLING
// ============================================================

function overlapsAny(start, end, spans) {
  return spans.some((s) => start < s.end && end > s.start);
}

// ============================================================
// MAIN TEXT SCANNER
// ============================================================

function scanText(text, settings) {
  const empty = { found: false, matches: [], riskScore: 0, totalDetections: 0 };

  if (!text || typeof text !== "string") return empty;

  const cfg = mergeWithDefaults(settings);
  const normalizedText = normalizeText(text);

  // ----------------------------------------------------------
  // 1. Collect candidates from all patterns
  // ----------------------------------------------------------

  const candidates = [];

  for (const pattern of PII_PATTERNS) {
    if (cfg.enabledCategories[pattern.category] === false) continue;
    if (!isPatternActiveForSensitivity(pattern.type, cfg.sensitivity)) continue;

    // Fresh regex per scan: no shared lastIndex state
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match;

    while ((match = regex.exec(normalizedText)) !== null) {
      if (match[0].length === 0) {
        regex.lastIndex++;
        continue;
      }

      const matchedText = match[0].trim();
      const start = match.index;
      const end = start + match[0].length;

      if (!validateMatch(pattern, matchedText)) continue;
      if (isAllowListed(matchedText, cfg.allowList)) continue;

      const confidence = calculateConfidence(pattern, normalizedText, matchedText, start);

      if (cfg.sensitivity === "relaxed" && confidence < 0.75) continue;

      candidates.push({
        type: pattern.type,
        category: pattern.category,
        value: matchedText,
        confidence,
        start,
        end
      });
    }
  }

  // ----------------------------------------------------------
  // 2. Confidentiality markers (whole-word, longest phrase first)
  // ----------------------------------------------------------

  if (cfg.enabledCategories.confidentiality !== false) {
    const keywords = [...CONFIDENTIAL_KEYWORDS].sort((a, b) => b.length - a.length);

    for (const keyword of keywords) {
      if (isAllowListed(keyword, cfg.allowList)) continue;

      const re = new RegExp(
        `(?<![a-z0-9])${escapeRegExp(keyword)}(?![a-z0-9])`,
        "gi"
      );
      let m;

      while ((m = re.exec(normalizedText)) !== null) {
        candidates.push({
          type: "Confidentiality Marker",
          category: "confidentiality",
          value: keyword,
          confidence: 0.72,
          start: m.index,
          end: m.index + m[0].length
        });
      }
    }
  }

  // ----------------------------------------------------------
  // 3. Resolve overlaps: highest confidence, then longest, wins
  // ----------------------------------------------------------

  candidates.sort((a, b) =>
    b.confidence - a.confidence ||
    (b.end - b.start) - (a.end - a.start) ||
    a.start - b.start
  );

  const accepted = [];
  const detections = new Map();

  for (const c of candidates) {
    if (overlapsAny(c.start, c.end, accepted)) continue;

    accepted.push({ start: c.start, end: c.end });

    const key = `${c.type}:${c.value.toLowerCase()}`;

    if (!detections.has(key)) {
      detections.set(key, {
        type: c.type,
        category: c.category,
        value: c.value,
        confidence: c.confidence,
        count: 1
      });
    } else {
      detections.get(key).count++;
    }
  }

  const detectionArray = Array.from(detections.values());

  // ----------------------------------------------------------
  // 4. Risk score
  // ----------------------------------------------------------

  const categoryWeight = {
    credential: 1.25,
    financial: 1.20,
    national_id: 1.15,
    email: 0.80,
    phone: 0.75,
    network: 0.55,
    confidentiality: 0.50
  };

  const riskScore = Math.min(
    100,
    Math.round(
      detectionArray.reduce((score, d) => {
        const weight = categoryWeight[d.category] || 0.5;
        return score + d.confidence * weight * Math.min(d.count, 5) * 20;
      }, 0)
    )
  );

  // ----------------------------------------------------------
  // 5. Result (redacted by default)
  // ----------------------------------------------------------

  return {
    found: detectionArray.length > 0,
    matches: detectionArray.map((d) => {
      const out = {
        type: d.type,
        category: d.category,
        count: d.count,
        confidence: Number(d.confidence.toFixed(2)),
        value: redactValue(d.value)
      };
      if (cfg.includeRaw) out.rawValue = d.value;
      return out;
    }),
    riskScore,
    totalDetections: detectionArray.reduce((t, d) => t + d.count, 0)
  };
}

// ============================================================
// FILE NAME SCANNER
// ============================================================

function scanFileName(fileName, settings) {
  const empty = { found: false, matches: [], riskScore: 0 };

  if (!fileName || typeof fileName !== "string") return empty;

  const cfg = mergeWithDefaults(settings);

  if (cfg.enabledCategories.filename === false) return empty;

  const normalized = fileName
    .replace(/\.[^/.]+$/, "")
    .toLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const hits = [];

  for (const keyword of SENSITIVE_FILENAME_KEYWORDS) {
    if (isAllowListed(keyword, cfg.allowList)) continue;

    const pattern = new RegExp(`(?:^|\\s)${escapeRegExp(keyword)}(?=\\s|$)`, "i");

    if (pattern.test(normalized)) hits.push(keyword);
  }

  if (hits.length === 0) return empty;

  return {
    found: true,
    matches: [
      {
        type: "Sensitive Filename",
        category: "filename",
        count: hits.length,
        confidence: 0.78,
        keywords: hits
      }
    ],
    riskScore: Math.min(100, 45 + hits.length * 10)
  };
}

// ============================================================
// REDACTION
// ============================================================

function redactValue(value) {
  if (!value || typeof value !== "string") return "";
  if (value.length <= 8) return "••••••";
  return value.slice(0, 3) + "••••••" + value.slice(-3);
}

// ============================================================
// EXPORTS
// ============================================================

if (typeof module !== "undefined") {
  module.exports = {
    scanText,
    scanFileName,
    redactValue,
    PII_PATTERNS,
    CONFIDENTIAL_KEYWORDS,
    SENSITIVE_FILENAME_KEYWORDS,
    DEFAULT_SETTINGS,
    mergeWithDefaults,
    passesLuhn,
    passesIbanMod97,
    passesVerhoeff,
    isValidIPv4
  };
}