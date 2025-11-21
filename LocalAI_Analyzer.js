// Load transformers.js
import * as transformers from "https://cdn.jsdelivr.net/npm/@xenova/transformers";

// ======================================================
// Global model + IAB data
// ======================================================
let embeddingModel = null;
let iabEmbeddings = null;


// ======================================================
// Load IAB Tier1 Embeddings
// ======================================================
async function loadIABEmbeddings() {
  try {
    console.log("Loading IAB embeddings...");

    const response = await fetch("data/tier1_embeddings.json");
    iabEmbeddings = await response.json();

    console.log(`Loaded ${iabEmbeddings.length} Tier1 categories.`);
  } catch (err) {
    console.error("Failed to load IAB embeddings:", err);
  }
}
loadIABEmbeddings();


// ======================================================
// Load MiniLM-L6-v2 model (384-dimensional embeddings)
// ======================================================
async function loadEmbeddingModel() {
  if (embeddingModel) return embeddingModel;

  console.log("Downloading MiniLM-L6-v2 model... The first load may take several seconds.");

  embeddingModel = await transformers.pipeline(
    "feature-extraction",
    "Xenova/all-MiniLM-L6-v2"
  );

  console.log("Model loaded successfully.");
  return embeddingModel;
}


// ======================================================
// Convert text → embedding (384 dimensions)
// ======================================================
async function embedText(text) {
  const model = await loadEmbeddingModel();

  const output = await model(text, {
    pooling: "mean",
    normalize: true,
  });

  return output.data;
}


// ======================================================
// Cosine similarity
// ======================================================
function cosineSimilarity(a, b) {
  let dot = 0, na = 0, nb = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }

  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}


// ======================================================
// Find best-matching IAB category
// ======================================================
function findBestCategory(userEmbedding) {
  let bestScore = -Infinity;
  let bestLabel = "Unknown";

  for (const item of iabEmbeddings) {
    const score = cosineSimilarity(userEmbedding, item.embedding);

    if (score > bestScore) {
      bestScore = score;
      bestLabel = item.label;
    }
  }

  return { label: bestLabel, score: bestScore };
}


// ======================================================
// Main event binding
// ======================================================
document.addEventListener("DOMContentLoaded", () => {
  const inputBox = document.getElementById("demoInput");
  const outputBox = document.getElementById("demoOutput");
  const runButton = document.getElementById("runDemoBtn");

  if (!inputBox || !outputBox || !runButton) {
    console.error("UI elements for demo were not found.");
    return;
  }

  runButton.addEventListener("click", async () => {
    const text = inputBox.value.trim();

    if (!text) {
      outputBox.textContent = "Please enter text before running the analysis.";
      return;
    }

    outputBox.textContent = "Analyzing... The first model load may require several seconds.";

    try {
      // Step 1: text → embedding
      const userEmbedding = await embedText(text);

      // Step 2: match with IAB categories
      const result = findBestCategory(userEmbedding);

      // Step 3: display result
      outputBox.textContent =
        `${result.label} (score: ${result.score.toFixed(3)})`;

    } catch (err) {
      console.error(err);
      outputBox.textContent = "Error occurred during analysis.";
    }
  });
});


// ======================================================
// Animation delays for fade-in elements
// ======================================================
document.querySelectorAll('.fade-in').forEach((el, index) => {
  el.style.animationDelay = `${index * 0.15}s`;
});

// Hover text mapping for all download buttons
const downloadHoverMap = {
  ".primary-download-btn": "Download from GitHub",
  ".mac-btn": "Google Drive",
  ".win-btn": "Google Drive"
};

Object.entries(downloadHoverMap).forEach(([selector, hoverText]) => {
  const btn = document.querySelector(selector);
  if (!btn) return;

  const defaultText = btn.textContent;

  btn.addEventListener("mouseenter", () => {
    btn.textContent = hoverText;
  });

  btn.addEventListener("mouseleave", () => {
    btn.textContent = defaultText;
  });
});
// ======================================================
// Browser Extension download link
// ======================================================
const browserExtBtn = document.querySelector(".primary-download-btn");

if (browserExtBtn) {
  browserExtBtn.addEventListener("click", () => {
    window.open(
      "https://github.com/Bangrui95/LocalAI_Analyzer/blob/main/Browser_Extension/LocalAI%20Analyzer.zip",
      "_blank"
    );
  });
}