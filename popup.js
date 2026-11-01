// popup.js
"use strict";

const DAY_MS = 24 * 60 * 60 * 1000;
const SENT_ANYWAY = ["warned_sent_anyway", "file_uploaded_anyway"];
const AVOIDED = ["warned_edited", "file_removed"];

const ACTION_LABELS = {
  warned_sent_anyway: "Sent anyway (text)",
  file_uploaded_anyway: "Uploaded anyway (file)",
  warned_edited: "Edited before sending",
  file_removed: "File removed"
};

let allEvents = [];
let currentEvents = []; // events in the selected range (used by export)

document.getElementById("version-tag").textContent =
  "v" + chrome.runtime.getManifest().version;

// ---------- helpers ----------

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function outcomeOf(e) {
  if (SENT_ANYWAY.includes(e.action)) return "sent_anyway";
  if (AVOIDED.includes(e.action)) return "avoided";
  return "other";
}

function isFile(e) {
  return e.source === "file_upload";
}

function typesOf(e) {
  return Array.isArray(e.types) ? e.types : [];
}

function topN(map, n) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

function getRangeDays() {
  const sel = document.getElementById("range");
  return sel ? Number(sel.value) : 7; // 0 = all time
}

function ensureRangeSelect() {
  if (document.getElementById("range")) return;

  // Replace the static "Last 7 Days" label with a selector
  const stats = document.getElementById("stats");
  const sel = document.createElement("select");
  sel.id = "range";
  sel.style.cssText =
    "font-size:11px;margin-bottom:10px;padding:2px 6px;border:1px solid #d1d5db;border-radius:6px;background:#f9fafb;";
  [["1", "Last 24 hours"], ["7", "Last 7 days"], ["30", "Last 30 days"], ["0", "All time"]]
    .forEach(([v, t]) => {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = t;
      if (v === "7") o.selected = true;
      sel.append(o);
    });

  const prev = stats.previousElementSibling;
  if (prev && /last\s*7\s*days/i.test(prev.textContent)) prev.remove();
  stats.before(sel);
  sel.addEventListener("change", () => render(allEvents));
}

// ---------- rendering ----------

function statRow(label, value, sub) {
  return `
    <div class="stat-row">
      <span class="stat-label">${esc(label)}${
        sub ? `<span style="color:#9ca3af;font-size:11px;"> ${esc(sub)}</span>` : ""
      }</span>
      <span class="stat-value">${esc(value)}</span>
    </div>`;
}

function barRows(entries, labelFn) {
  const max = entries.length ? entries[0][1] : 1;
  return entries
    .map(([key, count]) => {
      const w = Math.max(6, Math.round((count / max) * 100));
      return `
        <div class="bar-row">
          <div class="bar-label">${esc(labelFn ? labelFn(key) : key)}</div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${w}%"></div>
            <span class="bar-count">${count}</span>
          </div>
        </div>`;
    })
    .join("");
}

function sectionTitle(text) {
  return `<strong style="display:block;font-size:12px;margin:14px 0 6px;">${esc(text)}</strong>`;
}

function dailyTrend(events, days) {
  // Show up to the last 7 days as a mini bar chart
  const span = Math.min(days || 7, 7);
  const buckets = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = span - 1; i >= 0; i--) {
    const start = today.getTime() - i * DAY_MS;
    buckets.push({
      start,
      label: new Date(start).toLocaleDateString(undefined, { weekday: "short" }),
      count: 0
    });
  }
  events.forEach((e) => {
    const b = buckets.find((x) => e.timestamp >= x.start && e.timestamp < x.start + DAY_MS);
    if (b) b.count++;
  });

  const max = Math.max(1, ...buckets.map((b) => b.count));
  return `
    <div style="display:flex;gap:6px;align-items:flex-end;height:64px;">
      ${buckets
        .map((b) => {
          const h = Math.max(2, Math.round((b.count / max) * 44));
          return `
            <div style="flex:1;text-align:center;font-size:10px;color:#6b7280;">
              <div style="font-weight:600;color:#111827;">${b.count}</div>
              <div style="background:#b91c1c;height:${h}px;border-radius:3px;margin:2px 0;"></div>
              ${esc(b.label)}
            </div>`;
        })
        .join("")}
    </div>`;
}

function recentList(events) {
  const recent = [...events].sort((a, b) => b.timestamp - a.timestamp).slice(0, 8);
  return recent
    .map((e) => {
      const outcome = outcomeOf(e);
      const color = outcome === "sent_anyway" ? "#b91c1c" : outcome === "avoided" ? "#059669" : "#6b7280";
      const label = ACTION_LABELS[e.action] || e.action || "warned";
      return `
        <div style="font-size:11px;padding:6px 0;border-bottom:1px solid #f3f4f6;">
          <div style="display:flex;justify-content:space-between;gap:8px;">
            <span style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:170px;">
              ${esc(e.site || "(unknown site)")}
            </span>
            <span style="color:${color};font-weight:600;">${esc(label)}</span>
          </div>
          <div style="color:#6b7280;margin-top:2px;">
            ${esc(new Date(e.timestamp).toLocaleString())} · ${isFile(e) ? "file" : "text"} ·
            ${esc(typesOf(e).slice(0, 3).join(", ") || "n/a")}
          </div>
        </div>`;
    })
    .join("");
}

function render(events) {
  ensureRangeSelect();

  const days = getRangeDays();
  const cutoff = days ? Date.now() - days * DAY_MS : 0;
  const recent = events.filter((e) => e.timestamp >= cutoff);
  currentEvents = recent;

  const statsEl = document.getElementById("stats");
  const breakdownEl = document.getElementById("breakdown");

  if (recent.length === 0) {
    statsEl.innerHTML = "";
    breakdownEl.innerHTML =
      '<div id="empty-msg">No warnings in this period. Nice and clean 🎉</div>';
    return;
  }

  const total = recent.length;
  const fileWarnings = recent.filter(isFile).length;
  const textWarnings = total - fileWarnings;
  const sentAnyway = recent.filter((e) => outcomeOf(e) === "sent_anyway").length;
  const avoided = recent.filter((e) => outcomeOf(e) === "avoided").length;
  const decided = sentAnyway + avoided;
  const heedRate = decided ? Math.round((avoided / decided) * 100) + "%" : "n/a";
  const totalTypeHits = recent.reduce((s, e) => s + typesOf(e).length, 0);
  const uniqueSites = new Set(recent.map((e) => e.site).filter(Boolean)).size;
  const lastTs = Math.max(...recent.map((e) => e.timestamp));

  statsEl.innerHTML =
    statRow("Total warnings", total) +
    statRow("From typed/pasted text", textWarnings) +
    statRow("From file uploads", fileWarnings) +
    statRow("Sent/uploaded anyway", sentAnyway) +
    statRow("Edited / removed", avoided) +
    statRow("Heeded warning", heedRate, "(edited ÷ decided)") +
    statRow("Sensitive items flagged", totalTypeHits) +
    statRow("Sites involved", uniqueSites) +
    statRow("Last warning", new Date(lastTs).toLocaleString());

  const typeCounts = new Map();
  const siteCounts = new Map();
  const actionCounts = new Map();

  recent.forEach((e) => {
    typesOf(e).forEach((t) => typeCounts.set(t, (typeCounts.get(t) || 0) + 1));
    if (e.site) siteCounts.set(e.site, (siteCounts.get(e.site) || 0) + 1);
    const a = e.action || "unknown";
    actionCounts.set(a, (actionCounts.get(a) || 0) + 1);
  });

  breakdownEl.innerHTML =
    sectionTitle("Activity by day") +
    dailyTrend(recent, days) +
    sectionTitle("By data type") +
    barRows(topN(typeCounts, 10)) +
    sectionTitle("By site") +
    barRows(topN(siteCounts, 5)) +
    sectionTitle("By outcome") +
    barRows(topN(actionCounts, 6), (a) => ACTION_LABELS[a] || a) +
    sectionTitle("Recent activity") +
    recentList(recent);
}

// ---------- CSV export ----------

function csvCell(value) {
  let s = value === null || value === undefined ? "" : String(value);
  // Neutralize spreadsheet formula injection (site names etc. are untrusted)
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

function exportToCSV() {
  const events = currentEvents;
  if (events.length === 0) {
    alert("No events to export yet.");
    return;
  }

  const header = [
    "timestamp_iso", "date", "time", "weekday",
    "site", "source", "action", "outcome",
    "data_types", "type_count"
  ];

  const rows = [...events]
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((e) => {
      const d = new Date(e.timestamp);
      const types = typesOf(e);
      return [
        d.toISOString(),
        d.toLocaleDateString(),
        d.toLocaleTimeString(),
        d.toLocaleDateString(undefined, { weekday: "long" }),
        e.site || "",
        isFile(e) ? "file_upload" : (e.source || "chat_input"),
        e.action || "",
        outcomeOf(e),
        types.join("; "),
        types.length
      ];
    });

  // Summary block so the file is useful without a pivot table
  const typeCounts = new Map();
  events.forEach((e) => typesOf(e).forEach((t) => typeCounts.set(t, (typeCounts.get(t) || 0) + 1)));

  const summary = [
    [],
    ["SUMMARY"],
    ["total_warnings", events.length],
    ["sent_anyway", events.filter((e) => outcomeOf(e) === "sent_anyway").length],
    ["edited_or_removed", events.filter((e) => outcomeOf(e) === "avoided").length],
    ["file_warnings", events.filter(isFile).length],
    ["text_warnings", events.filter((e) => !isFile(e)).length],
    [],
    ["data_type", "warnings"],
    ...topN(typeCounts, typeCounts.size)
  ];

  const csv =
    "\uFEFF" + // BOM so Excel reads UTF-8 correctly
    [header, ...rows, ...summary]
      .map((r) => r.map(csvCell).join(","))
      .join("\r\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `aegis_report_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- load / wiring ----------

function load() {
  chrome.storage.local.get({ events: [] }, (data) => {
    allEvents = Array.isArray(data.events) ? data.events : [];
    render(allEvents);
  });
}

const clearBtn = document.getElementById("clear-btn");
let clearArmed = false;
clearBtn.addEventListener("click", () => {
  if (!clearArmed) {
    clearArmed = true;
    clearBtn.textContent = "Click again to confirm";
    setTimeout(() => {
      clearArmed = false;
      clearBtn.textContent = "Clear log";
    }, 3000);
    return;
  }
  clearArmed = false;
  clearBtn.textContent = "Clear log";
  chrome.storage.local.set({ events: [] }, load);
});

document.getElementById("export-btn").addEventListener("click", exportToCSV);

document.getElementById("settings-link").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

load();