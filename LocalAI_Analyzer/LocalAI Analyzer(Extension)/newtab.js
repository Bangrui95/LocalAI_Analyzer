document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.local.get({ newtabEnabled: false }, (data) => {

    const recSection = document.querySelector(".recommend-section");

    if (!data.newtabEnabled) {
      console.log("Newtab disabled → show ONLY search box");
      recSection.style.display = "none";
      return;
    }

    recSection.style.display = "flex";
    loadRecommendations();
  });
});

// ======================================================
//  recommendation
// ======================================================
async function loadRecommendations() {
  const container = document.getElementById("recommendContainer");
  container.innerHTML = "<p>Connecting to LocalAI backend</p>";

  const backendURL = "http://127.0.0.1:11668/rss_results";

  try {
    const pingRes = await fetch("http://127.0.0.1:11668/ping");
    if (!pingRes.ok) throw new Error("Backend not responding. Please ensure LocalAI_analyse is running.");

    container.innerHTML = "<p>Backend connected. Loading personalized results</p>";
    const res = await fetch(backendURL);
    if (!res.ok) throw new Error("Failed to fetch recommendations.");
    const data = await res.json();

    if (!data || !data.recommendations) {
      throw new Error("No valid recommendation data found. Please run RSS_search.py first.");
    }
    chrome.storage.local.set({ lastRssResults: data }, () => {
      console.log("Cached latest recommendations to local storage");
    });
    renderRecommendations(data, container);

  }
  catch (err) {
    console.error("Failed to load recommendation data:", err);
    const recSection = document.querySelector(".recommend-section");
    recSection.style.display = "none";
    return;
  }
}

function renderRecommendations(data, container, isCached = false) {
  try {
    const recs = data.recommendations;
    let html = `
      <p class="update-time">Updated: ${new Date(data.updated).toLocaleString()} ${isCached ? "(cached)" : ""}</p>
    `;

    for (const r of recs) {
      html += `
        <div class="block">
          <h2>${r.label}</h2>
          <ul>
      `;
      for (const a of r.top_articles) {
        html += `
          <li>
            <a href="${a.link}" target="_blank">${a.title}</a>
            <small>(${a.source} — Score ${a.score.toFixed(3)})</small>
          </li>
        `;
      }
      html += `
          </ul>
        </div>
      `;
    }

    container.innerHTML = html;
  } catch (e) {
    console.error("Render error:", e);
    container.innerHTML = `<p>Failed to render recommendation data.</p>`;
  }
}

document.addEventListener("DOMContentLoaded", loadRecommendations);