//------------------------------------------------------
// Element bindings
//------------------------------------------------------
const exportBtn = document.getElementById("exportBtn");
const analyzeBtn = document.getElementById("analyzeBtn");
const viewBtn = document.getElementById("viewBtn");
const settingsBtn = document.getElementById("settingsBtn");
const status = document.getElementById("status");
const runCircleBtn = document.getElementById("runCircleBtn");

//------------------------------------------------------
// Enable ALL BUTTONS
//------------------------------------------------------
function setButtonsEnabled(isEnabled) {
  exportBtn.disabled = !isEnabled;
  analyzeBtn.disabled = !isEnabled;
  viewBtn.disabled = !isEnabled;
  settingsBtn.disabled = !isEnabled;

  const btns = [exportBtn, analyzeBtn, viewBtn, settingsBtn];
  btns.forEach(btn => {
    if (!isEnabled) {
      btn.classList.add("disabled");
    } else {
      btn.classList.remove("disabled");
    }
  });
}

//------------------------------------------------------
// Backend status LED control for START button
//------------------------------------------------------
function setStartStatusOK() {
  runCircleBtn.classList.remove("status-error", "status-running");
  runCircleBtn.classList.add("status-ok");
}

function setStartStatusError() {
  runCircleBtn.classList.remove("status-ok", "status-running");
  runCircleBtn.classList.add("status-error");
}

function setStartStatusRunning() {
  runCircleBtn.classList.remove("status-ok", "status-error");
  runCircleBtn.classList.add("status-running");
}

//------------------------------------------------------
// Check Python backend status
//------------------------------------------------------
async function checkBackendStatus() {
  try {
    const res = await fetch("http://127.0.0.1:11668/ping");

    if (res.ok) {
      status.textContent = "Backend connected";
      status.style.color = "#00c3ff";
      analyzeBtn.disabled = false;
      setButtonsEnabled(true);
      setStartStatusOK();
    } else {
      throw new Error("Backend did not respond");
    }

  } catch (err) {
    status.textContent = "Backend off-line. Please start LocalAI_analyse.";
    status.style.color = "#ff7070";
    analyzeBtn.disabled = true;
    setButtonsEnabled(false);
    setStartStatusError();
  }
}
document.addEventListener("DOMContentLoaded", checkBackendStatus);

//------------------------------------------------------
// Export browsing history
//------------------------------------------------------
exportBtn.addEventListener("click", () => {
  status.textContent = "Exporting browsing history...";
  status.style.color = "#00bfff";

  chrome.runtime.sendMessage({ type: "EXPORT_HISTORY" }, (resp) => {
    if (chrome.runtime.lastError) {
      status.textContent =
        "Communication error: " + chrome.runtime.lastError.message;
      status.style.color = "#ff7070";
      return;
    }

    if (resp && resp.ok) {
      status.textContent = "Export completed";
      status.style.color = "#00e0ff";
    } else {
      status.textContent =
        "Export failed: " + (resp?.err || "Unknown error");
      status.style.color = "#ff7070";
    }
  });
});


//------------------------------------------------------
// Run local Python analysis
//------------------------------------------------------
analyzeBtn.addEventListener("click", () => {
  status.textContent = "Running local analysis";
  status.style.color = "#00bfff";

  setStartStatusRunning();
  chrome.runtime.sendMessage({ type: "RUN_PYTHON_ANALYSIS" }, (resp) => {
    if (chrome.runtime.lastError) {
      status.textContent =
        "Communication error: " + chrome.runtime.lastError.message;
      status.style.color = "#ff7070";

      setStartStatusError();
      return;
    }

    if (resp && resp.ok) {
      status.textContent =
        "Analysis complete";
      status.style.color = "#00e0ff";

      setStartStatusOK();

      chrome.tabs.create({ url: "index.html" });

    } else {
      status.textContent =
        "Analysis failed: " + (resp?.err || "Unknown error");
      status.style.color = "#ff7070";

      setStartStatusError();
    }
  });
});


//------------------------------------------------------
// results
//------------------------------------------------------
viewBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: "index.html" });
});


//------------------------------------------------------
// settings
//------------------------------------------------------
settingsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});


//------------------------------------------------------
// START button
//------------------------------------------------------
runCircleBtn.addEventListener("click", async () => {
  const exportBtn = document.getElementById("exportBtn");
  const analyzeBtn = document.getElementById("analyzeBtn");

  if (!exportBtn || !analyzeBtn) {
    console.warn("Required buttons not found. Combined run aborted.");
    return;
  }
  // 1
  exportBtn.click();
  console.log("Export process initiated.");
  // 2
  setTimeout(() => {
    analyzeBtn.click();
    console.log("Local analysis initiated.");
  }, 1500);
});