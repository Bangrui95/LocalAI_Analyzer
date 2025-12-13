document.addEventListener("DOMContentLoaded", () => {
  const resultBox = document.getElementById("resultBox");
  const refreshBtn = document.getElementById("refreshBtn");
  const status = document.getElementById("status");
  const deletedSection = document.getElementById("deletedSection");
  const deletedList = document.getElementById("deletedList");
  const customTagInput = document.getElementById("customTagInput");
  const saveCustomTagBtn = document.getElementById("saveCustomTagBtn");

  let activeTags = [];
  let deletedTags = [];

  // Generate a unique stable ID for each tag
  const makeId = () =>
    "tag_" + Date.now().toString(36) + Math.random().toString(16).slice(2);

  // Drag state
  const dragState = {
    isDragging: false,
    startX: 0,
    startWidth: 0,
    barEl: null,
    scoreEl: null,
    tagId: null,
    maxWidth: 0,
    maxCount: 0,
  };

  //------------------------------------------------------
  // Save to Local Storage
  //------------------------------------------------------
  function saveTagStateToLocal() {
    chrome.storage.local.set(
      {
        tagState: {
          activeTags,
          deletedTags,
          updated_at: new Date().toISOString(),
        },
      },
      () => console.log("Tag state saved.")
    );
  }

  //------------------------------------------------------
  // Load Results from Backend
  //------------------------------------------------------
  function loadResultsFromBackendAndOverrideLocal() {
    status.textContent = "Syncing with backend...";
    status.style.color = "#9da3b0";

    chrome.storage.local.get("pythonAnalysis", (data) => {
      const analysis = data.pythonAnalysis;
      if (!analysis || (!analysis.summary && !analysis.results)) {
        loadTagStateFromLocal();
        return;
      }

      const summary = analysis.summary || [];
      activeTags = summary.map((item) => ({
        id: makeId(),
        path: item.path,
        count: item.count ?? 0,
      }));
      deletedTags = [];
      renderTags();
      renderDeleted();
      saveTagStateToLocal();

      status.textContent = `Analysis results updated`;
      status.style.color = "#00e0ff";

      hasUnsavedChanges = false;
      setSaveStatus(false);
    });
  }

  //------------------------------------------------------
  // Restore from Local Storage
  //------------------------------------------------------
  function loadTagStateFromLocal() {
    status.textContent = "Restoring previous session...";
    status.style.color = "#9da3b0";

    chrome.storage.local.get("tagState", (data) => {
      if (data.tagState) {
        activeTags = (data.tagState.activeTags || []).map((t) => ({
          id: t.id || makeId(),
          path: t.path,
          count: t.count ?? 0,
        }));
        deletedTags = (data.tagState.deletedTags || []).map((t) => ({
          id: t.id || makeId(),
          path: t.path,
          count: t.count ?? 0,
        }));
        renderTags();
        renderDeleted();
        status.textContent = "No data found Waiting for analysis";
        status.style.color = "#00e0ff";
      } else {
        loadResultsFromBackendAndOverrideLocal();

        hasUnsavedChanges = false;
        setSaveStatus(false);
      }
    });
  }

  function sortTags() {
    activeTags.sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  }

  //------------------------------------------------------
  // Render Active Tags
  //------------------------------------------------------
  function renderTags() {
    sortTags();
    if (activeTags.length === 0) {
      resultBox.innerHTML = `<div class="no-data">No active label available</div>`;
      return;
    }

    const maxCount = Math.max(...activeTags.map((t) => t.count ?? 0));
    const listHTML = activeTags
      .map((item, i) => {
        const ratio = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
        return `
          <div class="summary-item" data-id="${item.id}">
            <div class="bar" style="width:${ratio}%;">
              <div class="bar-handle"></div>
            </div>
            <div class="cell-left">
              <span class="rank">${i + 1}.</span>
              <span class="path">${item.path}</span>
            </div>
            <div class="cell-center"><span class="score">${item.count}</span></div>
            <div class="cell-right"><button class="delete-btn" data-id="${item.id}">✖</button></div>
          </div>`;
      })
      .join("");

    resultBox.innerHTML = `
      <h2 style="color:#00e0ff;margin-bottom:10px;">Your Top ${activeTags.length} Labels</h2>
      <div class="summary-list">${listHTML}</div>
    `;

    // Delete buttons
    document.querySelectorAll(".delete-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        const idx = activeTags.findIndex((t) => t.id === id);
        if (idx !== -1) {
          const removed = activeTags.splice(idx, 1)[0];
          deletedTags.unshift(removed);
        }
        renderTags();
        renderDeleted();
        saveTagStateToLocal();
        status.textContent = "Label deleted";
        status.style.color = "#ff7070";
      });
    });

    // Dragging
    document.querySelectorAll(".bar-handle").forEach((handleEl) => {
      handleEl.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const rowEl = handleEl.closest(".summary-item");
        const tagId = rowEl.dataset.id;
        const barEl = rowEl.querySelector(".bar");
        const scoreEl = rowEl.querySelector(".score");

        const fullWidth = rowEl.getBoundingClientRect().width;
        const rightWidth =
          rowEl.querySelector(".cell-center").getBoundingClientRect().width +
          rowEl.querySelector(".cell-right").getBoundingClientRect().width +
          20;

        dragState.isDragging = true;
        dragState.startX = e.clientX;
        dragState.startWidth = barEl.offsetWidth;
        dragState.barEl = barEl;
        dragState.scoreEl = scoreEl;
        dragState.tagId = tagId;
        dragState.maxWidth = fullWidth - rightWidth;
        dragState.maxCount = maxCount;
        document.body.style.userSelect = "none";
      });
    });
  }

  //------------------------------------------------------
  // Handle Drag Move
  //------------------------------------------------------
  window.addEventListener("mousemove", (e) => {
    if (!dragState.isDragging) return;
    const dx = e.clientX - dragState.startX;
    let newWidth = dragState.startWidth + dx;
    newWidth = Math.max(0, Math.min(newWidth, dragState.maxWidth));

    const ratio = newWidth / dragState.maxWidth;
    const newCount = Math.round(dragState.maxCount * ratio);

    dragState.barEl.style.width = `${ratio * 100}%`;
    dragState.scoreEl.textContent = newCount;

    const tag = activeTags.find((t) => t.id === dragState.tagId);
    if (tag) tag.count = newCount;
  });

  window.addEventListener("mouseup", () => {
    if (!dragState.isDragging) return;
    dragState.isDragging = false;
    document.body.style.userSelect = "";
    sortTags();
    renderTags();
    renderDeleted();
    saveTagStateToLocal();
    status.textContent = "Label adjustment saved";
    status.style.color = "#00e0ff";
  });

  //------------------------------------------------------
  // Render Deleted Tags
  //------------------------------------------------------
  function renderDeleted() {
    if (deletedTags.length === 0) {
      deletedSection.style.display = "none";
      return;
    }
    deletedSection.style.display = "block";

    deletedList.innerHTML = deletedTags
      .map(
        (t) => `
        <div class="deleted-item" data-id="${t.id}">
          <span>${t.path}</span>
          <button class="restore-btn" data-id="${t.id}">Restore</button>
        </div>`
      )
      .join("");

    document.querySelectorAll(".restore-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const idx = deletedTags.findIndex((t) => t.id === id);
        if (idx !== -1) {
          const restored = deletedTags.splice(idx, 1)[0];
          activeTags.unshift(restored);
          renderTags();
          renderDeleted();
          saveTagStateToLocal();
          status.textContent = "Label restored successfully.";
          status.style.color = "#00e0ff";
        }
      });
    });
  }

  //------------------------------------------------------
  // Save Custom Tag
  //------------------------------------------------------
  function saveCustomTag() {
    const newPath = customTagInput.value.trim();
    if (!newPath) return;

    const firstCount = activeTags.length > 0 ? activeTags[0].count : 50;

    activeTags.unshift({
      id: makeId(),
      path: newPath,
      count: firstCount,
    });

    customTagInput.value = "";
    renderTags();
    renderDeleted();
    saveTagStateToLocal();

    status.textContent = `New Label "${newPath}" added successfully`;
    status.style.color = "#00e0ff";

    const customRow = document.querySelector(".custom-input-row");
    customRow.classList.remove("flash");
    void customRow.offsetWidth;
    customRow.classList.add("flash");
  }

  saveCustomTagBtn.addEventListener("click", saveCustomTag);
  customTagInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveCustomTag();
  });

  //------------------------------------------------------
  // Refresh Button
  //------------------------------------------------------
  refreshBtn.addEventListener("click", loadResultsFromBackendAndOverrideLocal);

  //------------------------------------------------------
  // Initialize
  //------------------------------------------------------
  loadResultsFromBackendAndOverrideLocal();

  //------------------------------------------------------
  // Save Status Button
  //------------------------------------------------------
  const saveStatusBtn = document.getElementById("saveStatusBtn");
  let hasUnsavedChanges = false;
  let isSaving = false;

  function setSaveStatus(unsaved) {
    if (unsaved) {
      saveStatusBtn.textContent = "Unsaved";
      saveStatusBtn.classList.remove("status-saved");
      saveStatusBtn.classList.add("status-unsaved");
    } else {
      saveStatusBtn.textContent = "Saved";
      saveStatusBtn.classList.remove("status-unsaved");
      saveStatusBtn.classList.add("status-saved");
    }
  }

  function markAsUnsaved() {
    if (!hasUnsavedChanges) {
      hasUnsavedChanges = true;
      setSaveStatus(true);
    }
  }

  async function saveCustomAnalysisFile() {
    if (!hasUnsavedChanges || isSaving) return;

    const totalCount = activeTags.length;
    const summary = activeTags.map((t) => ({
      path: t.path,
      count: t.count,
    }));

    chrome.storage.local.get("pythonAnalysis", (data) => {
      const analysis = data.pythonAnalysis;
      if (!analysis) {
        console.error("Cannot find the latest analysis result (pythonAnalysis).");
        return;
      }

      const dynamicSettings = analysis.settings || {};
      const payload = {
        totalCount: analysis.totalCount || 0, 
        totalAnalyzed: summary.length,      
        settings: dynamicSettings || {},
        summary,                          
      };

      isSaving = true;
      saveStatusBtn.disabled = true;
      saveStatusBtn.textContent = "Saving...";
      saveStatusBtn.style.opacity = "0.7";

      chrome.runtime.sendMessage(
        { type: "SAVE_CUSTOM_ANALYSIS", payload },
        (res) => {
          isSaving = false;
          saveStatusBtn.disabled = false;
          saveStatusBtn.style.opacity = "1";

          if (res?.ok) {
            hasUnsavedChanges = false;
            setSaveStatus(false);
            status.textContent = "Changes saved successfully";
            status.style.color = "#00e0ff";
          } else {
            console.error("Save failed:", res?.err);
            status.textContent = "Save failed Please try again";
            status.style.color = "#ff7070";
            setSaveStatus(true);
          }
        }
      );
    });
  }

  saveStatusBtn.addEventListener("click", saveCustomAnalysisFile);
  setSaveStatus(false);

  const originalSaveTagStateToLocal = saveTagStateToLocal;
  saveTagStateToLocal = function () {
    originalSaveTagStateToLocal.apply(this, arguments);
    markAsUnsaved();
  };
});