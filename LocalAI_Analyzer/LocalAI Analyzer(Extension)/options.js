// Initialize & Load Settings
const els = {
  historyRange: document.getElementById("historyRange"),
  historyDaysValue: document.getElementById("historyDaysValue"),
  granularityRange: document.getElementById("granularityRange"),
  granularityValue: document.getElementById("granularityValue"),
  samplingRange: document.getElementById("samplingRange"),
  samplingValue: document.getElementById("samplingValue"),
  saveBtn: document.getElementById("saveBtn"),
};

const defaults = { historyDays: 30, granularityLevel: 2, samplingCount: 20 };
let currentMax = 50;

// buttons
function withButtonLock(button, task, lockDuration = 2500) {
  if (!button) return;
  if (button.dataset.locked === "true") {
    console.log((button.id || "Button") + " is temporarily locked.");
    return;
  }

  button.dataset.locked = "true";
  button.disabled = true;

  Promise.resolve(task())
    .catch((err) => console.error("Button task error:", err))
    .finally(() => {
      setTimeout(() => {
        button.dataset.locked = "false";
        button.disabled = false;
      }, lockDuration);
    });
}

// inputs
chrome.storage.local.get(defaults, (data) => {
  els.historyRange.value = data.historyDays;
  els.historyDaysValue.textContent = data.historyDays;

  els.granularityRange.value = data.granularityLevel;
  els.granularityValue.textContent = data.granularityLevel;

  els.samplingRange.value = data.samplingCount;
  els.samplingValue.textContent = data.samplingCount;

  updateSamplingLimit(data.granularityLevel);
});

// Slider event binding
els.historyRange.addEventListener("input", () => {
  els.historyDaysValue.textContent = els.historyRange.value;
});

els.granularityRange.addEventListener("input", () => {
  const level = +els.granularityRange.value;
  els.granularityValue.textContent = level;
  updateSamplingLimit(level);
});

els.samplingRange.addEventListener("input", () => {
  let value = +els.samplingRange.value;
  if (value > currentMax) {
    value = currentMax;
    els.samplingRange.value = value;
    els.samplingValue.textContent = value;
    els.samplingRange.classList.add("flash-limit");
    setTimeout(() => els.samplingRange.classList.remove("flash-limit"), 600);
  } else {
    els.samplingValue.textContent = value;
  }
});

// Update sampling limit
function updateSamplingLimit(level) {
  const limitMap = { 1: 20, 2: 50, 3: 100 };
  currentMax = limitMap[level] || 100;

  if (+els.samplingRange.value > currentMax) {
    els.samplingRange.value = currentMax;
    els.samplingValue.textContent = currentMax;
  }
}

// Blacklist
const filterListContainer = document.getElementById("filterListContainer");
const addFilterBtn = document.getElementById("addFilterBtn");
const clearFilterBtn = document.getElementById("clearFilterBtn");

const MAX_VISIBLE_ROWS = 3;

function renderFilterList(list = []) {
  filterListContainer.innerHTML = "";

  if (list.length === 0) list = [""];

  list.forEach((site, index) => {
    const row = document.createElement("div");
    row.className = "filter-item";

    const input = document.createElement("input");
    input.type = "text";
    input.value = site;
    input.placeholder = "example.com";
    input.addEventListener("change", () => saveFilters());

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", () => {
      const inputs = Array.from(filterListContainer.querySelectorAll("input"));
      if (inputs.length <= 1) return;
      list.splice(index, 1);
      saveFilters(list);
    });

    row.appendChild(input);
    row.appendChild(removeBtn);
    filterListContainer.appendChild(row);
  });

  filterListContainer.style.overflowY =
    list.length > MAX_VISIBLE_ROWS ? "scroll" : "hidden";
}

function saveFilters(updatedList) {
  const sites =
    updatedList ||
    Array.from(filterListContainer.querySelectorAll("input"))
      .map((el) => el.value.trim())
      .filter((v) => v.length > 0);

  chrome.storage.local.set({ siteBlacklist: sites }, () => {
    console.log("Saved site blacklist:", sites);
    renderFilterList(sites);
  });
}

addFilterBtn.addEventListener("click", () => {
  const list = Array.from(filterListContainer.querySelectorAll("input")).map(
    (el) => el.value.trim()
  );
  list.push("");
  renderFilterList(list);
});

clearFilterBtn.addEventListener("click", () => {
  const clearedList = [""];
  chrome.storage.local.set({ siteBlacklist: clearedList }, () => {
    renderFilterList(clearedList);
    console.log("Cleared blacklist (kept one empty row).");
  });
});

chrome.storage.local.get({ siteBlacklist: [] }, (data) => {
  renderFilterList(data.siteBlacklist);
});

// Beautifulsoup
document.addEventListener("DOMContentLoaded", () => {
  const deepParsingCheckbox = document.getElementById("useDeepParsing");
  if (!deepParsingCheckbox) return;

  chrome.storage.local.get({ useDeepParsing: false }, (data) => {
    deepParsingCheckbox.checked = data.useDeepParsing;
  });

  deepParsingCheckbox.addEventListener("change", () => {
    const state = deepParsingCheckbox.checked;
    chrome.storage.local.set({ useDeepParsing: state }, () => {
      console.log("Deep Parsing:", state ? "Enabled" : "Disabled");
    });
  });
});

// Save All Settings
els.saveBtn.addEventListener("click", () => {
  withButtonLock(els.saveBtn, async () => {
    els.saveBtn.textContent = "Saving...";
    els.saveBtn.style.background = "linear-gradient(90deg, #00b4db, #0083b0)";
    els.saveBtn.disabled = true;

    const deepParsingCheckbox = document.getElementById("useDeepParsing");
    const settings = {
      historyDays: +els.historyRange.value,
      granularityLevel: +els.granularityRange.value,
      samplingCount: +els.samplingRange.value,
      useDeepParsing: deepParsingCheckbox ? deepParsingCheckbox.checked : false,
    };

    const blacklist = Array.from(
      document.querySelectorAll("#filterListContainer input")
    )
      .map((el) => el.value.trim())
      .filter((v) => v.length > 0);

    const fullSettings = { ...settings, siteBlacklist: blacklist };

    await chrome.storage.local.set(fullSettings);
    chrome.runtime.sendMessage({ type: "REFRESH_SETTINGS", value: fullSettings });

    // Export RSS settings
    try {
      const rssSources = Array.from(
        document.querySelectorAll("#rssListContainer input")
      )
        .map((el) => el.value.trim())
        .filter((v) => v.length > 0);

      const rssDays = +document.getElementById("rssDaysRange").value;
      const rssCount = +document.getElementById("rssCountRange").value;
      const rssAutoUpdateHours = parseFloat(
        document.getElementById("rssAutoUpdateRange").value
      );

      const { newtabEnabled } = await new Promise((resolve) =>
        chrome.storage.local.get({ newtabEnabled: false }, resolve)
      );

      const rssSettings = {
        enabled: newtabEnabled,
        feeds: rssSources,
        historyDays: rssDays,
        recommendCount: rssCount,
        autoUpdate: rssAutoUpdateHours > 0,
        updateIntervalHours: rssAutoUpdateHours
      };

      await new Promise((resolve) => setTimeout(resolve, 50));

      const res = await fetch("http://127.0.0.1:11668/save_rss_settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rssSettings),
      });

      let data = {};
      try { data = await res.json(); } catch { }
      if (res.ok) {
        console.log("RSS Settings saved successfully:", data);
      } else {
        console.error("Failed to save RSS settings:", data);
      }
    } catch (err) {
      console.error("Error exporting RSS settings:", err);
    }

    // UI confirmation animation
    els.saveBtn.textContent = "Saved";
    els.saveBtn.style.background = "linear-gradient(90deg, #28a745, #00c853)";

    setTimeout(() => {
      els.saveBtn.textContent = "Save Settings";
      els.saveBtn.style.background =
        "linear-gradient(90deg, #007bff, #00c3ff)";
    }, 1500);
  });
});

// Personalized Page + RSS Settings
document.addEventListener("DOMContentLoaded", () => {
  const newtabToggle = document.getElementById("toggleNewtab");
  if (!newtabToggle) return;
  const rssSectionBlocks = document.querySelectorAll(
    ".block-rss-source, .block-rss-days, .block-rss-count, .block-rss-auto-update, .block-rss-actions"
  );

  chrome.storage.local.get({ newtabEnabled: false }, (data) => {
    newtabToggle.checked = data.newtabEnabled;
    toggleRssAvailability(data.newtabEnabled);
  });

  newtabToggle.addEventListener("change", () => {
    const state = newtabToggle.checked;
    chrome.storage.local.set({ newtabEnabled: state }, () => {
      toggleRssAvailability(state);
    });
  });

  function toggleRssAvailability(isEnabled) {
    rssSectionBlocks.forEach((block) => {
      if (!isEnabled) {
        block.classList.add("disabled-section");
        block.querySelectorAll("input, button, select").forEach((el) => {
          el.disabled = true;
        });
      } else {
        block.classList.remove("disabled-section");
        block.querySelectorAll("input, button, select").forEach((el) => {
          el.disabled = false;
        });
      }
    });
  }
});

// RSS Source List
const rssListContainer = document.getElementById("rssListContainer");
const addRSSBtn = document.getElementById("addRSSBtn");
const clearRSSLinksBtn = document.getElementById("clearRSSLinksBtn");
const updateRSSBtn = document.getElementById("updateRSSBtn");

function renderRSSList(list = []) {
  rssListContainer.innerHTML = "";
  if (list.length === 0) list = [""];

  list.forEach((url, index) => {
    const row = document.createElement("div");
    row.className = "filter-item";

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "https://example.com/rss.xml";
    input.value = url;
    input.addEventListener("change", () => saveRSSList());

    const remove = document.createElement("button");
    remove.className = "remove-btn";
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      const inputs = Array.from(rssListContainer.querySelectorAll("input"));
      if (inputs.length <= 1) return; // Prevent removing the last input row
      list.splice(index, 1);
      saveRSSList(list);
    });

    row.appendChild(input);
    row.appendChild(remove);
    rssListContainer.appendChild(row);
  });
}

function saveRSSList(updated) {
  const links =
    updated ||
    Array.from(rssListContainer.querySelectorAll("input"))
      .map((el) => el.value.trim())
      .filter((v) => v.length > 0);

  chrome.storage.local.set({ rssSources: links }, () => {
    renderRSSList(links);
  });
}

addRSSBtn?.addEventListener("click", () => {
  const list = Array.from(rssListContainer.querySelectorAll("input")).map(
    (el) => el.value.trim()
  );
  list.push("");
  renderRSSList(list);
});

// Clear all
clearRSSLinksBtn?.addEventListener("click", () => {
  const cleared = [""];
  chrome.storage.local.set({ rssSources: cleared }, () => {
    renderRSSList(cleared);
  });
});
// --------------------------------------------------------------
async function silentSaveRSSSettings() {
  try {
    const rssSources = Array.from(
      document.querySelectorAll("#rssListContainer input")
    )
      .map((el) => el.value.trim())
      .filter((v) => v.length > 0);

    const rssDays = +document.getElementById("rssDaysRange").value;
    const rssCount = +document.getElementById("rssCountRange").value;
    const rssAutoUpdateHours = parseFloat(
      document.getElementById("rssAutoUpdateRange").value
    );

    const { newtabEnabled } = await new Promise((resolve) =>
      chrome.storage.local.get({ newtabEnabled: false }, resolve)
    );

    const rssSettings = {
      enabled: newtabEnabled,
      feeds: rssSources,
      historyDays: rssDays,
      recommendCount: rssCount,
      autoUpdate: rssAutoUpdateHours > 0,
      updateIntervalHours: rssAutoUpdateHours,
    };

    await fetch("http://127.0.0.1:11668/save_rss_settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rssSettings),
    });

    console.log("Silent RSS settings saved.");
  } catch (err) {
    console.error("Silent RSS saving failed:", err);
  }
}
// Manual Update RSS (direct backend call)
updateRSSBtn?.addEventListener("click", async () => {
  const btn = updateRSSBtn;
  btn.disabled = true;

  const originalText = btn.textContent;
  const originalBg = btn.style.background;

  btn.textContent = "Updating RSS...";
  btn.style.background = "linear-gradient(90deg, #00b4db, #0083b0)";

  await silentSaveRSSSettings();
  await new Promise((resolve) => setTimeout(resolve, 300));

  try {
    const res = await fetch("http://127.0.0.1:11668/update_rss", { method: "POST" });
    const data = await res.json();

    if (res.ok && data.status === "ok") {
      btn.textContent = "RSS Updated";
      btn.style.background = "linear-gradient(90deg, #28a745, #00c853)";
    } else {
      btn.textContent = "Update Failed";
      btn.style.background = "linear-gradient(90deg, #ff6b6b, #ff8e53)";
    }
  } catch (err) {
    console.error("RSS update error:", err);
    btn.textContent = "Connection Failed";
    btn.style.background = "linear-gradient(90deg, #ff6b6b, #ff8e53)";
  }

  setTimeout(updateRssStatus, 1000);

  setTimeout(() => {
    btn.disabled = false;
    btn.textContent = originalText;
    btn.style.background = originalBg || "linear-gradient(90deg, #007bff, #00c3ff)";
  }, 5000);
});

chrome.storage.local.get({ rssSources: [] }, (data) =>
  renderRSSList(data.rssSources)
);

// Clear RSS backend
const clearRSSCacheBtn = document.getElementById("clearRSSCacheBtn");

clearRSSCacheBtn?.addEventListener("click", async () => {
  const btn = clearRSSCacheBtn;
  btn.disabled = true;
  btn.textContent = "Clearing RSS...";

  try {
    const res = await fetch("http://127.0.0.1:11668/clear_rss_cache", {
      method: "POST",
    });
    const data = await res.json();

    if (res.ok && data.status === "ok") {
      btn.textContent = "RSS Cleared";
      btn.style.background = "linear-gradient(90deg, #28a745, #00c853)";
    } else {
      btn.textContent = "Clear Failed";
      btn.style.background = "linear-gradient(90deg, #ff6b6b, #ff8e53)";
    }
  } catch (err) {
    btn.textContent = "Connection Failed";
    btn.style.background = "linear-gradient(90deg, #ff6b6b, #ff8e53)";
  }

  setTimeout(() => {
    btn.disabled = false;
    btn.textContent = "Clear Cached RSS";
    btn.style.background = "linear-gradient(90deg, #dc3545, #ff7675)";
  }, 2500);
});

// RSS Days
const rssDaysRange = document.getElementById("rssDaysRange");
const rssDaysValue = document.getElementById("rssDaysValue");

chrome.storage.local.get({ rssDays: 14 }, (data) => {
  rssDaysRange.value = data.rssDays;
  rssDaysValue.textContent = data.rssDays;
});

rssDaysRange.addEventListener("input", () => {
  const val = Number(rssDaysRange.value);
  rssDaysValue.textContent = val;
  chrome.storage.local.set({ rssDays: val });
});

// RSS Count Range
const rssCountRange = document.getElementById("rssCountRange");
const rssCountValue = document.getElementById("rssCountValue");

chrome.storage.local.get({ rssCount: 20 }, (data) => {
  rssCountRange.value = data.rssCount;
  rssCountValue.textContent = data.rssCount;
});

rssCountRange.addEventListener("input", () => {
  const val = Number(rssCountRange.value);
  rssCountValue.textContent = val;
  chrome.storage.local.set({ rssCount: val });
});

// RSS Auto Update Interval (0–24 hours)
const rssAutoUpdateRange = document.getElementById("rssAutoUpdateRange");
const rssAutoUpdateValue = document.getElementById("rssAutoUpdateValue");

// Initialize auto update state
chrome.storage.local.get(
  { rssAutoUpdateHours: 1, newtabEnabled: false },
  (data) => {
    rssAutoUpdateRange.value = data.rssAutoUpdateHours;
    rssAutoUpdateValue.textContent = data.rssAutoUpdateHours;
  }
);

// Update text while sliding
rssAutoUpdateRange.addEventListener("input", () => {
  const val = parseFloat(rssAutoUpdateRange.value);
  rssAutoUpdateValue.textContent = val;
});

// Sync with Personalized Page toggle
document.addEventListener("DOMContentLoaded", () => {
  const newtabToggle = document.getElementById("toggleNewtab");
  if (!newtabToggle) return;

  newtabToggle.addEventListener("change", async () => {
    const personalizedEnabled = newtabToggle.checked;

    const { rssAutoUpdateEnabled } = await new Promise((resolve) =>
      chrome.storage.local.get({ rssAutoUpdateEnabled: false }, resolve)
    );

    // Disable auto update when personalized page is disabled
    if (!personalizedEnabled && rssAutoUpdateEnabled) {
      try {
        await fetch("http://127.0.0.1:11668/stop_auto_update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
      } catch (err) {
        console.error("Failed to stop AutoUpdate:", err);
      }
    }
  });
});

// RSS Status Elements
const rssArticlesCount = document.getElementById("rssArticlesCount");
const rssFileSize = document.getElementById("rssFileSize");

// Fetch and update RSS status from backend
async function updateRssStatus() {
  try {
    const res = await fetch("http://127.0.0.1:11668/rss_status");
    if (!res.ok) throw new Error("HTTP " + res.status);

    const data = await res.json();

    if (data.exists) {
      rssArticlesCount.textContent = `Articles: ${data.total_articles}`;
      rssFileSize.textContent = `Size: ${data.file_size_mb} MB`;
    } else {
      rssArticlesCount.textContent = "Articles: 0";
      rssFileSize.textContent = "Size: 0 MB";
    }
  } catch (err) {
    console.warn("RSS status fetch failed:", err);
    rssArticlesCount.textContent = "Articles: --";
    rssFileSize.textContent = "Size: --";
  }
}
updateRssStatus();

//------------------------------------------------------
// Save RSS Settings
//------------------------------------------------------
const saveRssSettingsBtn = document.getElementById("saveRssSettingsBtn");
saveRssSettingsBtn?.addEventListener("click", async () => {
  document.getElementById("saveBtn").click();
  setTimeout(updateRssStatus, 1000);
});

const updateBtn = document.getElementById("updateRSSBtn");
updateBtn?.addEventListener("click", async () => {
  try {
    const res = await fetch("http://127.0.0.1:11668/update_rss", { method: "POST" });
    const data = await res.json();
    console.log("Manual RSS update result:", data);
  } catch (err) {
    console.error("Manual RSS update failed:", err);
  }

  setTimeout(updateRssStatus, 1000);
});

//------------------------------------------------------
// Clear RSS
//------------------------------------------------------
const clearBtn = document.getElementById("clearRSSCacheBtn");
clearBtn?.addEventListener("click", async () => {
  try {
    const res = await fetch("http://127.0.0.1:11668/clear_rss_cache", { method: "POST" });
    const data = await res.json();
    console.log("RSS cache cleared:", data);
  } catch (err) {
    console.error("Clear RSS cache failed:", err);
  }

  setTimeout(updateRssStatus, 1000);
});