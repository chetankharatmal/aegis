// popup.js

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// Show the extension's version number, pulled straight from manifest.json
// so it's never out of sync with what Chrome thinks is installed.
document.getElementById("version-tag").textContent =
  "v" + chrome.runtime.getManifest().version;

function render(events) {
  const cutoff = Date.now() - SEVEN_DAYS_MS;
  const recent = events.filter((e) => e.timestamp >= cutoff);

  const statsEl = document.getElementById("stats");
  const breakdownEl = document.getElementById("breakdown");

  if (recent.length === 0) {
    statsEl.innerHTML = "";
    breakdownEl.innerHTML =
      '<div id="empty-msg">No warnings yet. Nice and clean 🎉</div>';
    return;
  }

  const totalWarnings = recent.length;
  const sentAnyway = recent.filter(
    (e) => e.action === "warned_sent_anyway" || e.action === "file_uploaded_anyway"
  ).length;
  const avoided = recent.filter(
    (e) => e.action === "warned_edited" || e.action === "file_removed"
  ).length;
  const fileWarnings = recent.filter((e) => e.source === "file_upload").length;
  const textWarnings = totalWarnings - fileWarnings;

  statsEl.innerHTML = `
    <div class="stat-row">
      <span class="stat-label">Total warnings</span>
      <span class="stat-value">${totalWarnings}</span>
    </div>
    <div class="stat-row">
      <span class="stat-label">From typed/pasted text</span>
      <span class="stat-value">${textWarnings}</span>
    </div>
    <div class="stat-row">
      <span class="stat-label">From file uploads</span>
      <span class="stat-value">${fileWarnings}</span>
    </div>
    <div class="stat-row">
      <span class="stat-label">Sent/uploaded anyway</span>
      <span class="stat-value">${sentAnyway}</span>
    </div>
    <div class="stat-row">
      <span class="stat-label">Edited / removed</span>
      <span class="stat-value">${avoided}</span>
    </div>
  `;

  // Count by data type
  const typeCounts = {};
  recent.forEach((e) => {
    e.types.forEach((t) => {
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    });
  });

  const sortedTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
  const maxCount = sortedTypes.length > 0 ? sortedTypes[0][1] : 1;

  breakdownEl.innerHTML =
    "<strong style='font-size:12px;'>By data type:</strong>" +
    sortedTypes
      .map(([type, count]) => {
        const widthPct = Math.max(6, Math.round((count / maxCount) * 100));
        return `
          <div class="bar-row">
            <div class="bar-label">${type}</div>
            <div class="bar-track">
              <div class="bar-fill" style="width:${widthPct}%"></div>
              <span class="bar-count">${count}</span>
            </div>
          </div>
        `;
      })
      .join("");

  // stash the currently-rendered events so the export button can reuse them
  window.__aegisRecentEvents = recent;
}

function exportToCSV() {
  const events = window.__aegisRecentEvents || [];
  if (events.length === 0) {
    alert("No events to export yet.");
    return;
  }

  const header = ["timestamp", "site", "source", "action", "types"];
  const rows = events.map((e) => [
    new Date(e.timestamp).toISOString(),
    e.site || "",
    e.source || "chat_input",
    e.action || "",
    (e.types || []).join("; ")
  ]);

  const csvContent = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `aegis_report_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function load() {
  chrome.storage.local.get({ events: [] }, (data) => {
    render(data.events);
  });
}

document.getElementById("clear-btn").addEventListener("click", () => {
  chrome.storage.local.set({ events: [] }, load);
});

document.getElementById("export-btn").addEventListener("click", exportToCSV);

document.getElementById("settings-link").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

load();
