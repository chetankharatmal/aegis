// options.js

const SENSITIVITY_DESCRIPTIONS = {
  strict: "All rules active, including the noisiest one (long random-looking strings). More false positives, less chance of missing something.",
  balanced: "All rules active except the noisiest edge cases. Recommended default.",
  relaxed: "Drops the 'Generic Long Secret' rule, which is the most prone to false positives (e.g. long order/reference numbers)."
};

const DEFAULT_SETTINGS = {
  sensitivity: "balanced",
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

let currentSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

function renderSensitivity() {
  document.querySelectorAll(".sensitivity-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.value === currentSettings.sensitivity);
  });
  document.getElementById("sensitivity-desc").textContent =
    SENSITIVITY_DESCRIPTIONS[currentSettings.sensitivity] || "";
}

function renderCategories() {
  document.querySelectorAll("input[data-category]").forEach((checkbox) => {
    const category = checkbox.dataset.category;
    checkbox.checked = currentSettings.enabledCategories[category] !== false;
  });
}

function renderAllowList() {
  const container = document.getElementById("allow-list-items");
  container.innerHTML = "";
  currentSettings.allowList.forEach((entry, index) => {
    const chip = document.createElement("div");
    chip.className = "allow-list-chip";

    const label = document.createElement("span");
    label.textContent = entry;
    chip.appendChild(label);

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "✕";
    removeBtn.onclick = () => {
      currentSettings.allowList.splice(index, 1);
      renderAllowList();
      saveSettings();
    };
    chip.appendChild(removeBtn);

    container.appendChild(chip);
  });
}

function showSaved() {
  const status = document.getElementById("save-status");
  status.textContent = "✓ Saved";
  setTimeout(() => {
    status.textContent = "";
  }, 1500);
}

function saveSettings() {
  chrome.storage.local.set({ aegisSettings: currentSettings }, showSaved);
}

function loadSettings() {
  chrome.storage.local.get({ aegisSettings: DEFAULT_SETTINGS }, (data) => {
    currentSettings = data.aegisSettings || JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    // fill in any missing keys (e.g. after an upgrade added a new category)
    currentSettings.enabledCategories = {
      ...DEFAULT_SETTINGS.enabledCategories,
      ...currentSettings.enabledCategories
    };
    if (!Array.isArray(currentSettings.allowList)) currentSettings.allowList = [];

    renderSensitivity();
    renderCategories();
    renderAllowList();
  });
}

document.querySelectorAll(".sensitivity-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    currentSettings.sensitivity = btn.dataset.value;
    renderSensitivity();
    saveSettings();
  });
});

document.querySelectorAll("input[data-category]").forEach((checkbox) => {
  checkbox.addEventListener("change", () => {
    currentSettings.enabledCategories[checkbox.dataset.category] = checkbox.checked;
    saveSettings();
  });
});

document.getElementById("allow-list-add-btn").addEventListener("click", () => {
  const input = document.getElementById("allow-list-input");
  const value = input.value.trim();
  if (!value) return;
  if (!currentSettings.allowList.includes(value)) {
    currentSettings.allowList.push(value);
    renderAllowList();
    saveSettings();
  }
  input.value = "";
});

document.getElementById("allow-list-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    document.getElementById("allow-list-add-btn").click();
  }
});

loadSettings();
