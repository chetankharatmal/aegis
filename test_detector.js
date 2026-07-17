// Quick standalone test — run with: node test_detector.js
const { scanText } = require("./detector.js");

// Content-detection test cases
const testCases = [
  {
    name: "Clean text",
    text: "Can you help me write a poem about the ocean?",
    expectFound: false
  },
  {
    name: "Email",
    text: "Please contact john.doe@company.com for details.",
    expectFound: true
  },
  {
    name: "Credit card",
    text: "My card number is 4111 1111 1111 1111, please process it.",
    expectFound: true
  },
  {
    name: "API key",
    text: "Here's my key: sk-abcdefghijklmnopqrstuvwxyz123456",
    expectFound: true
  },
  {
    name: "Confidentiality marker",
    text: "This document is CONFIDENTIAL, internal use only. Summarize it.",
    expectFound: true
  },
  {
    name: "SSN",
    text: "Employee SSN: 123-45-6789",
    expectFound: true
  }
];

let passed = 0;
let total = testCases.length;

testCases.forEach((tc) => {
  const result = scanText(tc.text);
  const ok = result.found === tc.expectFound;
  console.log(
    `${ok ? "✅ PASS" : "❌ FAIL"} - ${tc.name} -> found=${result.found} matches=${JSON.stringify(result.matches)}`
  );
  if (ok) passed++;
});

// Filename-detection test cases
const { scanFileName } = require("./detector.js");

const fileNameCases = [
  { name: "Plain notes filename", fileName: "quarterly_notes.txt", expectFound: false },
  { name: "Resume filename", fileName: "My_Resume_2026.pdf", expectFound: true },
  { name: "Passport filename", fileName: "passport-scan.png", expectFound: true },
  { name: "NDA filename", fileName: "nda_signed_vendor.pdf", expectFound: true },
  { name: "False-positive guard (cvs)", fileName: "cvs_pharmacy_receipt.pdf", expectFound: false },
  { name: "False-positive guard (recap)", fileName: "recap_of_meeting.txt", expectFound: false }
];

fileNameCases.forEach((tc) => {
  const result = scanFileName(tc.fileName);
  const ok = result.found === tc.expectFound;
  console.log(
    `${ok ? "✅ PASS" : "❌ FAIL"} - ${tc.name} -> found=${result.found} matches=${JSON.stringify(result.matches)}`
  );
  if (ok) passed++;
  total++;
});

console.log(`\n${passed}/${total} tests passed`);

// ------------------------------------------------------------------
// New coverage: additional PII types, settings, allow-list, sensitivity
// ------------------------------------------------------------------
const { DEFAULT_SETTINGS } = require("./detector.js");

console.log("\n--- Extended detection coverage ---");
const extendedCases = [
  { name: "IBAN", text: "My IBAN is DE89370400440532013000", expectFound: true },
  { name: "Passport number", text: "Passport number AB1234567", expectFound: true },
  { name: "BTC wallet", text: "Send to bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh", expectFound: true },
  { name: "ETH wallet", text: "Address: 0x742d35Cc6634C0532925a3b844Bc454e4438f44e", expectFound: true },
  { name: "Bank account", text: "account number 12345678901", expectFound: true }
];
extendedCases.forEach((tc) => {
  const result = scanText(tc.text);
  const ok = result.found === tc.expectFound;
  console.log(`${ok ? "✅ PASS" : "❌ FAIL"} - ${tc.name} -> ${JSON.stringify(result.matches)}`);
  if (ok) passed++;
  total++;
});

console.log("\n--- Settings: category toggle ---");
const noEmail = { ...DEFAULT_SETTINGS, enabledCategories: { ...DEFAULT_SETTINGS.enabledCategories, email: false } };
{
  const result = scanText("Contact me at test@company.com", noEmail);
  const ok = result.found === false;
  console.log(`${ok ? "✅ PASS" : "❌ FAIL"} - Email category disabled -> ${JSON.stringify(result.matches)}`);
  if (ok) passed++;
  total++;
}

console.log("\n--- Settings: allow-list ---");
const allowListed = { ...DEFAULT_SETTINGS, allowList: ["fakecorp-test.com"] };
{
  const result = scanText("Email: jane@fakecorp-test.com", allowListed);
  const ok = result.found === false;
  console.log(`${ok ? "✅ PASS" : "❌ FAIL"} - Allow-listed domain suppressed -> ${JSON.stringify(result.matches)}`);
  if (ok) passed++;
  total++;
}

console.log("\n--- Settings: relaxed sensitivity ---");
const relaxed = { ...DEFAULT_SETTINGS, sensitivity: "relaxed" };
{
  const result = scanText("token: abcdefghijklmnopqrstuvwxyz123456", relaxed);
  const ok = result.found === false;
  console.log(`${ok ? "✅ PASS" : "❌ FAIL"} - Relaxed mode drops Generic Long Secret -> ${JSON.stringify(result.matches)}`);
  if (ok) passed++;
  total++;
}

console.log(`\nFINAL: ${passed}/${total} tests passed`);
