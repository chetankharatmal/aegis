// background.js
// Service worker: content scripts cannot call chrome.notifications directly,
// so they send a message here whenever sensitive data is detected, and this
// worker raises a real OS-level desktop notification (the "alert pop").

chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === "aegis_alert") {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: message.title || "⚠️ AEGIS: Sensitive data detected",
      message: message.body || "Review before sending.",
      priority: 2
    });
  }
});
