chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set(
    {
      installedAt: new Date().toISOString(),

      // Browsing / Analysis Defaults
      historyDays: 30,        
      granularityLevel: 2,      
      samplingCount: 50,        
      siteBlacklist: [],        
      useDeepParsing: true,     
      // Personalized Page
      newtabEnabled: false,     
      // RSS Settings
      rssSources: [],           
      rssDays: 14,             
      rssCount: 20,             
      rssAutoUpdateHours: 1,   
      rssAutoUpdateEnabled: true
    },
    () => console.log("Initial settings have been configured.")
  );
});

// history
async function fetchHistory(days = 30) {
  const dayMs = 24 * 60 * 60 * 1000;
  const now = Date.now();

  let total = [];
  let rangeDays = 0;
  const step = 15;    
  const maxLimit = 5000; 
  let done = false;

  console.log(`Fetching browsing history: targeting the past ${days} days, up to ${maxLimit} entries.`);

  while (!done) {
    const startTime = now - (rangeDays + step) * dayMs;
    const endTime = now - rangeDays * dayMs;

    const results = await new Promise((resolve) => {
      chrome.history.search(
        { text: "", startTime, endTime, maxResults: 1000 },
        (res) => resolve(res || [])
      );
    });

    total.push(...results);
    console.log(`Collected ${total.length} entries so far, covering approximately ${rangeDays + step} days.`);

    rangeDays += step;
    if (results.length === 0 || total.length >= maxLimit || rangeDays >= days) {
      done = true;
      console.log(`Fetch complete: total ${total.length} entries (covering about ${rangeDays} days).`);
    }

    await new Promise((r) => setTimeout(r, 200));
  }

  const unique = Array.from(
    new Map(total.map((r) => [r.id || r.url, r])).values()
  ).sort((a, b) => b.lastVisitTime - a.lastVisitTime);

  const processed = unique.map((r) => ({
    hostname: (() => {
      try {
        return new URL(r.url).hostname;
      } catch {
        return "(local)";
      }
    })(),
    title: r.title || "(NONE)",
    url: r.url,
    lastVisitTime: new Date(r.lastVisitTime).toISOString(),
    visitCount: r.visitCount || 1,
    description: "(NONE)",
    embeddingText: "(NONE)"
  }));

  chrome.storage.local.set({ historyData: processed }, () => {
    console.log(`${processed.length} history entries cached`);
  });

  return processed;
}


// download
async function ensureDownloadFolderExists(folderName) {
  try {
    const initId = await chrome.downloads.download({
      url: "data:text/plain,init",
      filename: `${folderName}/.init.txt`,
      saveAs: false
    });
    await chrome.downloads.erase({ id: initId });
  } catch (err) {
    console.warn("Failed to pre-create download directory:", err.message);
  }
}

async function notifyPythonBackend(filename) {
  try {
    const {
      historyDays,
      granularityLevel,
      samplingCount,
      siteBlacklist = [],
      useDeepParsing = true
    } = await new Promise((resolve) =>
      chrome.storage.local.get(
        ["historyDays", "granularityLevel", "samplingCount", "siteBlacklist", "useDeepParsing"],
        resolve
      )
    );

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const res = await fetch("http://127.0.0.1:11668/notify_download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename,
        settings: {
          historyDays,
          granularityLevel,
          samplingCount,
          siteBlacklist,
          useDeepParsing 
        }
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);
    const data = await res.json();
    console.log("Backend received:", data);
  } catch (err) {
    console.warn("Backend notify failed:", err.message);
  }
}


// download JSON
async function exportHistoryToJSON() {
  try {
    const {
      historyDays = 30,
      siteBlacklist = [],
      useDeepParsing = true
    } = await new Promise((resolve) =>
      chrome.storage.local.get(
        ["historyDays", "siteBlacklist", "useDeepParsing"],
        resolve
      )
    );

    console.log(`Current export duration setting: ${historyDays} days`);
    const historyData = await fetchHistory(historyDays);

    const filtered = historyData.filter(
      (item) => !siteBlacklist.some((domain) => item.url.includes(domain))
    );
    console.log(`Remaining after blacklist filtering: ${filtered.length} items.`);

    const {
      installedAt,
      granularityLevel,
      samplingCount
    } = await new Promise((resolve) =>
      chrome.storage.local.get(
        ["installedAt", "granularityLevel", "samplingCount"],
        resolve
      )
    );

    // useDeepParsing
    const jsonData = {
      generatedAt: new Date().toISOString(),
      installedAt: installedAt || "(unknown)",
      totalCount: filtered.length,
      settings: {
        historyDays,
        granularityLevel,
        samplingCount,
        siteBlacklist,
        useDeepParsing 
      },
      items: filtered
    };

    // 导出 JSON 文件
    const folderName = "browser_history";
    await ensureDownloadFolderExists(folderName);
    const filename = `${folderName}/history_${Date.now()}.json`;
    const base64 = btoa(
      unescape(encodeURIComponent(JSON.stringify(jsonData, null, 2)))
    );
    const dataUrl = "data:application/json;base64," + base64;

    await chrome.downloads.download({
      url: dataUrl,
      filename,
      saveAs: false,
      conflictAction: "overwrite"
    });
    console.log(`Export completed: ${filename}`);

    await notifyPythonBackend(filename);
  } catch (err) {
    console.error("Export failed:", err);
  }
}


chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  if (msg.type === "EXPORT_HISTORY") {
    exportHistoryToJSON()
      .then(() => sendResponse({ ok: true }))
      .catch((err) =>
        sendResponse({ ok: false, err: err.message })
      );
    return true; 
  }

  if (msg.type === "RUN_PYTHON_ANALYSIS") {
    chrome.storage.local.get(
      [
        "historyDays",
        "granularityLevel",
        "samplingCount",
        "siteBlacklist",
        "useDeepParsing"
      ],
      async ({
        historyDays,
        granularityLevel,
        samplingCount,
        siteBlacklist = [],
        useDeepParsing = true
      }) => {
        try {
          const res = await fetch("http://127.0.0.1:11668/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              settings: {
                historyDays,
                granularityLevel,
                samplingCount,
                siteBlacklist,
                useDeepParsing
              }
            })
          });

          const data = await res.json();
          chrome.storage.local.set({ pythonAnalysis: data }, () => {
            console.log("Analysis result received:", data);
            sendResponse({ ok: true });
          });
        } catch (err) {
          console.error("Analysis request failed:", err);
          sendResponse({ ok: false, err: err.message });
        }
      }
    );
    return true;
  }


  if (msg.type === "REFRESH_SETTINGS") {
    const {
      historyDays,
      granularityLevel,
      samplingCount,
      siteBlacklist = [],
      useDeepParsing
    } = msg.value || {};

    chrome.storage.local.set(
      {
        historyDays,
        granularityLevel,
        samplingCount,
        siteBlacklist,
        useDeepParsing
      },
      () => {
        console.log(
          `New settings: days=${historyDays}, level=${granularityLevel}, count=${samplingCount}, blacklist=${siteBlacklist.length}, deepParsing=${useDeepParsing}`
        );
        sendResponse({ ok: true });
      }
    );
    return true;
  }


  if (msg.type === "SAVE_CUSTOM_ANALYSIS") {
    console.log("Received save request, sending to backend");
    fetch("http://127.0.0.1:11668/save_custom_analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(msg.payload),
    })
      .then((res) => res.json())
      .then((data) => {
        console.log("Save successful:", data);
        sendResponse({ ok: true, data });
      })
      .catch((err) => {
        console.error("Save failed:", err);
        sendResponse({ ok: false, err: err.message });
      });
    return true; 
  }

});



chrome.storage.local.get({ historyDays: 30 }, ({ historyDays }) => {
  console.log(`Extension started: preloading ${historyDays} days of history`);
  fetchHistory(historyDays);
});
