# ======================================================
# 🔹 LocalAI_analyse Backend
# ======================================================

import os, sys, time, json, shutil, threading, traceback
from pathlib import Path
from datetime import datetime, timezone, timedelta
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from email.utils import parsedate_to_datetime
import numpy as np, torch, requests, feedparser, tldextract
from bs4 import BeautifulSoup
from sentence_transformers import SentenceTransformer, util
#  FastAPI Framework
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
import uvicorn
import re

os.environ["TOKENIZERS_PARALLELISM"] = "false"

# ======================================================
# TIME
# ======================================================
def parse_rss_datetime(dt_str: str) -> datetime | None:
    if not dt_str:
        return None
    try:
        dt = parsedate_to_datetime(dt_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None

# ======================================================
# PATH/
# ======================================================
def resource_path(relative_path: str) -> Path:
    if hasattr(sys, "_MEIPASS"):
        base_path = Path(sys._MEIPASS)
    else:
        base_path = Path(__file__).resolve().parent
    return base_path / relative_path

# ======================================================
# Log
# ======================================================
try:
    LOG_FILE = Path.home() / "localai_app_log.txt"
    LOG_FILE.touch(exist_ok=True)
except Exception:
    LOG_FILE = Path(__file__).resolve().parent / "localai_app_log.txt"

def log(msg: str):
    print(msg)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}\n")
    except Exception:
        pass

# ======================================================
# FastAPI
# ======================================================
app = FastAPI(title="LocalAI_analyse Backend", version="6.6")
latest_download_name = None

# ======================================================
# ping
# ======================================================
@app.get("/ping")
async def ping():
    return {"status": "ok"}

# ======================================================
# download from web
# ======================================================
@app.post("/notify_download")
async def notify_download(req: Request):
    global latest_download_name
    data = await req.json()
    latest_download_name = data.get("filename")
    if not latest_download_name:
        log("[File] No filename received from frontend.")
        return JSONResponse({"error": "Missing filename"}, status_code=400)
    log(f"[File] Received filename: {latest_download_name}")
    return {"status": "ok", "received": latest_download_name}

# ======================================================
# copy JSON
# ======================================================
def copy_latest_history():
    """Copy the latest exported history file after ensuring it is fully written."""
    global latest_download_name

    if not latest_download_name:
        log("[File] No filename received; copy operation skipped.")
        return None

    downloads_dir = Path.home() / "Downloads"
    src = downloads_dir / Path(latest_download_name)
    # wait 10s
    max_wait = 10  
    waited = 0
    while not src.exists() and waited < max_wait:
        time.sleep(0.2)
        waited += 0.2

    if not src.exists():
        log(f"[File] Timeout waiting for file to appear: {src}")
        return None

    last_size = -1
    stable_count = 0
    while stable_count < 3:  # require 3 consecutive stable checks
        current_size = src.stat().st_size
        if current_size == last_size and current_size > 0:
            stable_count += 1
        else:
            stable_count = 0
            last_size = current_size
        time.sleep(0.2)

    #copy
    backend_dir = Path(__file__).resolve().parent
    project_dir = backend_dir.parent
    dest = project_dir / "history_exports" / "history_latest.json"
    dest.parent.mkdir(parents=True, exist_ok=True)

    try:
        shutil.copy(src, dest)
        log(f"[File] File copied and old version replaced: {src} → {dest}")
        return dest
    except Exception as e:
        log(f"[File] Error while copying file: {e}")
        return None

# ======================================================
#   Download RSS
# ======================================================
def fetch_meta_description(url: str) -> str:
    if not url.startswith(("http://", "https://")):
        return ""
    try:
        headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)"}
        response = requests.get(url, headers=headers, timeout=5)
        if response.status_code != 200:
            return ""
        soup = BeautifulSoup(response.text, "html.parser")
        meta = soup.find("meta", attrs={"name": "description"})
        return meta["content"].strip() if meta and "content" in meta.attrs else ""
    except Exception:
        return ""

# ======================================================
# Clean text for embedding 
# ======================================================
import re

def clean_text(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r"[^\w\s\u4e00-\u9fff]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


# ======================================================
# Beautiful + embeddingTEXT
# ======================================================
def enrich_history_items(items, use_deep_parsing=True):
    enriched_path = Path(__file__).resolve().parent.parent / "history_compare" / "history_enriched.json"
    enriched_cache = {}
    if not use_deep_parsing:
        log("[BeautifulSoup] Deep parsing:false")
        updated_items = []
        for item in items:
            url = item.get("url", "")
            title = item.get("title", "")
            hostname = ""
            try:
                ext = tldextract.extract(url)
                hostname = f"{ext.domain}.{ext.suffix}" if ext.suffix else ext.domain
            except Exception:
                pass
            embedding_text = f"{title}. Source: {hostname}".strip()
            updated_items.append({**item, "description": "", "embeddingText": embedding_text})
        return updated_items

    if enriched_path.exists():
        try:
            with open(enriched_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict) and "items" in data:
                    enriched_cache = {i["url"]: i for i in data["items"] if i.get("url")}
                    log(f"[BeautifulSoup] Loaded {len(enriched_cache)} cached records.")
        except Exception as e:
            log(f"[BeautifulSoup] Failed to read cache; regenerating. Error: {e}")
            enriched_cache = {}

    urls_to_fetch = [i["url"] for i in items if i.get("url") not in enriched_cache]
    if urls_to_fetch:
        with ThreadPoolExecutor(max_workers=12) as executor:
            futures = {executor.submit(fetch_meta_description, url): url for url in urls_to_fetch}
            for idx, future in enumerate(as_completed(futures)):
                url = futures[future]
                desc = future.result()
                enriched_cache[url] = {"url": url, "description": desc}
                log(f"[BeautifulSoup] Successfully fetched ({idx + 1} / {len(futures)}): {url}")

    updated_items = []
    for item in items:
        url = item.get("url", "")
        title = item.get("title", "")
        desc = enriched_cache.get(url, {}).get("description", "")
        hostname = ""
        try:
            ext = tldextract.extract(url)
            hostname = f"{ext.domain}.{ext.suffix}" if ext.suffix else ext.domain
        except Exception:
            pass
        raw_text = f"{title} {desc} Source {hostname}"
        embedding_text = clean_text(raw_text)
        updated_items.append({**item, "description": desc, "embeddingText": embedding_text})

    enriched_path.parent.mkdir(parents=True, exist_ok=True)
    with open(enriched_path, "w", encoding="utf-8") as f:
        json.dump({"items": list(enriched_cache.values()), "updated_at": datetime.now().isoformat()}, f, ensure_ascii=False, indent=2)

    return updated_items



# ======================================================
# RSS Embedding Cache
# ======================================================

EMBED_CACHE_PATH = Path(__file__).resolve().parent.parent / "rss" / "rss_embedding_cache.json"

def load_embedding_cache():
    if EMBED_CACHE_PATH.exists():
        try:
            return json.load(open(EMBED_CACHE_PATH, "r", encoding="utf-8"))
        except:
            return {}
    return {}

def save_embedding_cache(cache):
    with open(EMBED_CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)

def clean_embedding_cache(valid_titles):
    cache = load_embedding_cache()
    before = len(cache)

    new_cache = {title: emb for title, emb in cache.items() if title in valid_titles}

    if len(new_cache) != before:
        save_embedding_cache(new_cache)
        log(f"[RSS] Cleaned {before - len(new_cache)} outdated embeddings")

    return new_cache



# ======================================================
#  Model
# ======================================================
def load_model_and_taxonomy():
    log("[Model] Loading model and taxonomy library...")
    model_path = resource_path("data/sentence-transformers--all-mpnet-base-v2")
    taxonomy_path = resource_path("data/taxonomy_embeddings.json")
    device = "mps" if torch.backends.mps.is_available() else "cuda" if torch.cuda.is_available() else "cpu"
    model = SentenceTransformer(str(model_path.resolve()), device=device, local_files_only=True)
    with open(taxonomy_path, "r", encoding="utf-8") as f:
        taxonomy_data = json.load(f)["data"]
    taxonomy_embeddings = np.array([list(map(float, t["embedding"].split())) for t in taxonomy_data])
    taxonomy_paths = [t["path"] for t in taxonomy_data]
    log(f"[Model] Taxonomy loaded successfully with {len(taxonomy_paths)} entries.")
    return model, taxonomy_embeddings, taxonomy_paths, device


def fetch_rss_articles():
    os.environ["RSS_MODE"] = "1"

    try:
        log("[RSS] Starting FAST multi-threaded RSS fetching...")

        backend_dir = Path(__file__).resolve().parent
        project_dir = backend_dir.parent
        rss_dir = project_dir / "rss"
        rss_setting_path = rss_dir / "rss_setting" / "rss_settings.json"
        rss_dir.mkdir(parents=True, exist_ok=True)
        summary_path = rss_dir / "rss_summary.json"

        # Load settings
        settings = {}
        if rss_setting_path.exists():
            with open(rss_setting_path, "r", encoding="utf-8") as f:
                settings = json.load(f)
            log(f"[Setting] Configuration loaded: {settings}")

        if not settings.get("enabled", True):
            log("[RSS] RSS disabled → skip.")
            return []

        rss_feeds = settings.get("feeds", [])
        if not rss_feeds:
            rss_feeds = [
                "https://feeds.bbci.co.uk/news/world/rss.xml",
                "https://feeds.bbci.co.uk/news/technology/rss.xml",
                "https://techcrunch.com/feed/",
                "https://www.theverge.com/rss/index.xml",
                "https://github.blog/feed/",
                "https://hnrss.org/frontpage"
            ]

        max_days = int(settings.get("historyDays", 14))
        cutoff_dt = datetime.now(timezone.utc) - timedelta(days=max_days)
        log(f"[RSS] Only keeping articles newer than {max_days} days.")

        def clean_html(raw_html):
            if not raw_html:
                return ""
            try:
                soup = BeautifulSoup(raw_html, "html.parser")
                for tag in soup(["script", "style", "iframe", "nav", "footer", "img"]):
                    tag.decompose()
                return " ".join(soup.get_text(" ", strip=True).split())[:2000]
            except:
                return str(raw_html)[:2000]

        def fetch_one_feed(url):
            try:
                feed = feedparser.parse(url)
                source_name = getattr(feed.feed, "title", None) or url
                source_name = source_name.strip()

                items = []
                seen_local = set()

                for entry in feed.entries:
                    title = entry.get("title", "").strip()
                    if not title or title in seen_local:
                        continue

                    pub_dt = parse_rss_datetime(entry.get("published", ""))
                    if pub_dt and pub_dt < cutoff_dt:
                        continue

                    summary_raw = (
                        entry.get("summary", "") or
                        entry.get("description", "") or
                        (entry.get("content", [{}])[0].get("value", "") if entry.get("content") else "")
                    )

                    items.append({
                        "title": title,
                        "link": entry.get("link", ""),
                        "summary": clean_html(summary_raw),
                        "published": entry.get("published", ""),
                        "source": source_name
                    })

                    seen_local.add(title)

                log(f"[RSS][OK] {source_name}: {len(items)} items")
                return items

            except Exception as e:
                log(f"[RSS][ERR] {url}: {e}")
                return []

        all_articles = []
        with ThreadPoolExecutor(max_workers=12) as executor:
            results = executor.map(fetch_one_feed, rss_feeds)

            for items in results:
                all_articles.extend(items)

        log(f"[RSS] Total fetched: {len(all_articles)} articles")

        if summary_path.exists():
            with open(summary_path, "r", encoding="utf-8") as f:
                old = json.load(f).get("data", [])

            old_titles = {a["title"] for a in old}
            new_articles = [a for a in all_articles if a["title"] not in old_titles]
            merged = old + new_articles
        else:
            merged = all_articles

        # Save summary
        feed_counter = Counter(a["source"] for a in merged)
        json.dump({
            "updated": datetime.now().isoformat(),
            "total": len(merged),
            "feeds": [{"source": k, "count": v} for k, v in feed_counter.items()],
            "data": merged,
        }, open(summary_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

        log(f"[RSS] Summary saved, total: {len(merged)} items")
        return merged

    except Exception as e:
        log(f"[RSS] ERROR: {e}")
        log(traceback.format_exc())
        return []


def analyze_rss_embeddings():
    try:
        log("[RSS] Starting RSS embedding recommendation analysis...")
        device = "mps" if torch.backends.mps.is_available() else (
            "cuda" if torch.cuda.is_available() else "cpu"
        )
        model_path = resource_path("data/sentence-transformers--all-mpnet-base-v2")

        backend_dir = Path(__file__).resolve().parent
        project_dir = backend_dir.parent
        rss_dir = project_dir / "rss"
        summary_path = rss_dir / "rss_summary.json"

        if not summary_path.exists():
            log("[RSS] rss_summary.json not found, skipping.")
            return

        summary_data = json.load(open(summary_path, "r", encoding="utf-8"))
        all_articles = summary_data.get("data", [])
        if not all_articles:
            log("[RSS] Summary empty, skip.")
            return

        all_titles = {a["title"] for a in all_articles}
        embedding_cache = clean_embedding_cache(all_titles)
        log(f"[RSS] Embedding cache after cleanup: {len(embedding_cache)} items")

        to_compute = []
        for art in all_articles:
            title = art["title"]
            if title not in embedding_cache:
                text = f"{art['title']} {art['summary']}".strip()
                to_compute.append((title, text))

        if to_compute:
            log(f"[RSS] {len(to_compute)} missing embeddings, computing...")

            titles, texts = zip(*to_compute)
            
            model = SentenceTransformer(str(model_path), device=device)
            encoded = model.encode(list(texts), convert_to_numpy=True)

            for i, title in enumerate(titles):
                embedding_cache[title] = encoded[i].tolist()

            save_embedding_cache(embedding_cache)
            log("[RSS] Missing embeddings saved.")

        rss_embeddings = [embedding_cache[a["title"]] for a in all_articles]

        rss_emb_tensor = torch.tensor(rss_embeddings, device=device)

        log("[RSS] Embedding ready, continue recommendation...")

        rss_setting_path = rss_dir / "rss_setting" / "rss_settings.json"
        recommend_count = 10
        if rss_setting_path.exists():
            with open(rss_setting_path, "r", encoding="utf-8") as f:
                rss_settings = json.load(f)
                recommend_count = int(rss_settings.get("recommendCount", 10))

        history_dir = project_dir / "history_compare"
        custom = history_dir / "custom_analysis_result.json"
        last = history_dir / "last_analysis_result.json"
        user_label_path = custom if custom.exists() else last if last.exists() else None
        if not user_label_path:
            log("[RSS] No user labels found, skip recommendation.")
            return

        user_label_data = json.load(open(user_label_path, "r", encoding="utf-8"))
        summary_items = user_label_data.get("summary", [])
        if not summary_items:
            log("[RSS] Empty user summary, skip.")
            return

        total_weight = sum(i["count"] for i in summary_items)
        allocations = []
        for item in summary_items:
            ratio = item["count"] / total_weight
            allocated = max(1, int(round(ratio * recommend_count)))
            allocations.append({"label": item["path"], "allocated": allocated})

        model = SentenceTransformer(str(model_path), device=device)

        results = []

        for alloc in allocations:
            label = alloc["label"]
            count = alloc["allocated"]
            label_vec = model.encode(label, convert_to_tensor=True, device=device)

            cosine = util.cos_sim(label_vec, rss_emb_tensor)[0]

            top_idx = torch.topk(cosine, k=20).indices.tolist()

            used_titles = set()
            top_articles = []
            for i in top_idx:
                a = all_articles[i]
                if a["title"] in used_titles:
                    continue
                used_titles.add(a["title"])
                top_articles.append({
                    "title": a["title"],
                    "link": a["link"],
                    "score": float(cosine[i].item()),
                    "source": a.get("source", "")
                })
                if len(top_articles) >= count:
                    break

            results.append({"label": label, "top_articles": top_articles})

        recommend_path = rss_dir / "rss_recommend.json"
        json.dump({
            "updated": datetime.now().isoformat(),
            "recommendations": results
        }, open(recommend_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

        log("[RSS] Final recommendation saved.")

    except Exception as e:
        log(f"[RSS] ERROR: {e}")
        log(traceback.format_exc())



# ======================================================
# Main analyse
# ======================================================
def run_analysis(latest_path, settings=None):
    try:
        log("=" * 66)
        log("[Analysis] Starting full analysis pipeline...")
        log("[Analysis] Running history data analysis (embedding, clustering, and label extraction)...")

        backend_dir = Path(__file__).resolve().parent
        project_dir = backend_dir.parent
        history_dir = project_dir / "history_compare"
        history_dir.mkdir(parents=True, exist_ok=True)

        with open(latest_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        history_items = data.get("items", [])
        total_count = data.get("totalCount", len(history_items))

        if not settings or not isinstance(settings, dict) or not settings:
            settings = data.get("settings", {}) or {}
            log("[Config] Frontend configuration missing. Loading default settings from JSON file.")

        use_deep_parsing = settings.get("useDeepParsing", True)
        TOP_N = int(settings.get("topN", 5))
        THRESHOLD = float(settings.get("threshold", 0.39))
        granularityLevel = int(settings.get("granularityLevel", 3))
        samplingCount = int(settings.get("samplingCount", 20))
        siteBlacklist = settings.get("siteBlacklist", [])
        log(f"[Setting] Setting: deepParsing={use_deep_parsing}, TOP_N={TOP_N}, "
            f"THRESHOLD={THRESHOLD}, granularityLevel={granularityLevel}, "
            f"samplingCount={samplingCount}, blacklistCount={len(siteBlacklist)}")

        filtered_items = [i for i in history_items if not any(b.lower() in i.get("url", "").lower() for b in siteBlacklist)]
        log(f"[Setting] Blacklist filtering completed: {len(filtered_items)} / {len(history_items)} records retained.")

        enriched_items = enrich_history_items(filtered_items, use_deep_parsing)

        model, taxonomy_embeddings, taxonomy_paths, device = load_model_and_taxonomy()

        embedding_texts = [i["embeddingText"] for i in enriched_items if i.get("embeddingText")]
        text_embeddings = model.encode(embedding_texts, convert_to_tensor=True, normalize_embeddings=True, device=device)
        taxonomy_tensors = torch.tensor(taxonomy_embeddings, dtype=torch.float32, device=device)

        results = []
        for i, item in enumerate(enriched_items):
            sims = util.cos_sim(text_embeddings[i], taxonomy_tensors)[0].cpu().numpy()
            top_idx = np.argsort(sims)[::-1][:TOP_N]
            top_labels = [
                {"path": taxonomy_paths[j], "score": float(sims[j])}
                for j in top_idx if sims[j] >= THRESHOLD
            ] or [{"path": taxonomy_paths[int(np.argmax(sims))], "score": float(np.max(sims))}]
            results.append({
                "title": item["title"],
                "url": item["url"],
                "embeddingText": item["embeddingText"],
                "top_labels": top_labels
            })
        embedding_analysis_path = history_dir / "embedding_analysis.json"
        detailed_results = {
            "results": results,
            "analyzed_count": len(results),
            "settings": settings,
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }

        with open(embedding_analysis_path, "w", encoding="utf-8") as f:
            json.dump(detailed_results, f, ensure_ascii=False, indent=2)

        log(f"[File] Embedding comparison analysis file exported: {embedding_analysis_path.name}")

        tier_scores = {}
        for r in results:
            for label in r["top_labels"]:
                path, score = label["path"], label["score"]
                if score < THRESHOLD:
                    continue
                parts = path.split(" > ")
                if granularityLevel == 1:
                    key = parts[0]
                elif granularityLevel == 2 and len(parts) >= 2:
                    key = " > ".join(parts[:2])
                else:
                    key = path
                tier_scores.setdefault(key, {"count": 0, "total_score": 0})
                tier_scores[key]["count"] += 1
                tier_scores[key]["total_score"] += score

        summary_sorted = sorted(
            [{"path": k, "count": v["count"], "total_score": round(v["total_score"], 4)} for k, v in tier_scores.items()],
            key=lambda x: (-x["total_score"], -x["count"])
        )[:samplingCount]

        result_path = history_dir / "last_analysis_result.json"
        json.dump({
            "totalCount": total_count,
            "settings": settings,
            "totalAnalyzed": len(summary_sorted),
            "summary": summary_sorted
        }, open(result_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

        custom_path = history_dir / "custom_analysis_result.json"
        shutil.copy(result_path, custom_path)
        log("[File] custom_analysis_result.json updated.")

        log(f"[Analysis] Historical data analysis completed. Generated {len(summary_sorted)} user interest tags.")
        log("=" * 33)

        rss_dir = project_dir / "rss"
        rss_dir.mkdir(parents=True, exist_ok=True)
        rss_summary_path = rss_dir / "rss_summary.json"

        if rss_summary_path.exists():
            log("[RSS] Existing rss_summary.json detected — skipping fetch phase.")
        else:
            log("[RSS] rss_summary.json not found — starting RSS fetch process.")
            fetch_rss_articles()

        analyze_rss_embeddings()
        log("[RSS] RSS recommendation analysis has been successfully completed.")
        log("=" * 33)

        log("[Analysis] Full analysis pipeline completed")
        log("=" * 66)

        return {
            "summary": summary_sorted,
            "totalAnalyzed": len(filtered_items),
           "status": "Full analysis pipeline successfully completed."
        }

    except Exception as e:
        log(f"[Error] Exception occurred in run_analysis: {e}")
        log(traceback.format_exc())
        return {
            "summary": [],
            "totalAnalyzed": 0,
            "error": str(e)
        }

# ======================================================
# HTTP
# ======================================================
@app.post("/analyze")
async def analyze(req: Request):
    try:
        latest_path = copy_latest_history()
        if not latest_path:
            return JSONResponse({"error": "No matching file found in the history_exports directory."}, status_code=404)
        data = await req.json()
        settings = data.get("settings", {})
        log(f"[Setting] Analysis parameters received: {settings}")
        result = run_analysis(latest_path, settings)
        return JSONResponse(result)
    except Exception as e:
        log(f"[Error] Exception occurred during analysis: {e}")
        log(traceback.format_exc())
        return JSONResponse({"error": str(e)}, status_code=500)

@app.get("/rss_results")
async def get_rss_results():
    rss_file = Path(__file__).resolve().parent.parent / "rss" / "rss_recommend.json"
    if not rss_file.exists():
        return JSONResponse({"error": "rss_recommend.json not found"}, status_code=404)
    data = json.load(open(rss_file, "r", encoding="utf-8"))
    return JSONResponse(data)


# ======================================================
# AUTO update
# ======================================================
auto_update_thread = None
auto_update_flag = False

def auto_update_worker(default_interval=0):
    """Background auto-update loop (skips first immediate run, starts after countdown)."""
    global auto_update_flag
    log("[AutoUpdate] Background update process has been initiated (first run will start after interval).")

    backend_dir = Path(__file__).resolve().parent
    project_dir = backend_dir.parent
    rss_setting_path = project_dir / "rss" / "rss_setting" / "rss_settings.json"

    first_run = True

    while auto_update_flag:
        try:
            interval_hours = default_interval
            if rss_setting_path.exists():
                with open(rss_setting_path, "r", encoding="utf-8") as f:
                    settings = json.load(f)
                    interval_hours = float(settings.get("updateIntervalHours", default_interval))
            else:
                log("[AutoUpdate] rss_settings.json not found, using default interval.")

            if interval_hours <= 0:
                log("[AutoUpdate] Interval = 0h detected, background task stopped.")
                auto_update_flag = False
                break

            if first_run:
                log(f"[AutoUpdate] Waiting {interval_hours} hours before first automatic update...")
                total_seconds = int(interval_hours * 3600)
                for _ in range(total_seconds):
                    if not auto_update_flag:
                        break
                    time.sleep(1)
                first_run = False 
                continue  
            log(f"[AutoUpdate] Running scheduled RSS fetch and embedding analysis (update interval: {interval_hours} hours).")

            fetch_rss_articles()
            analyze_rss_embeddings()

            log(f"[AutoUpdate] Automatic update completed successfully. Next execution in {interval_hours} hours.")

        except Exception as e:
            log(f"[AutoUpdate] Exception occurred during automatic update: {e}")
            log(traceback.format_exc())

        total_seconds = int(interval_hours * 3600)
        for _ in range(total_seconds):
            if not auto_update_flag:
                break
            time.sleep(1)

    log("[AutoUpdate] Background update task has been stopped.")

# ======================================================
# Save setting
# ======================================================
@app.post("/save_custom_analysis")
async def save_custom_analysis(req: Request):
    try:
        data = await req.json()
        compare_dir = Path(__file__).resolve().parent.parent / "history_compare"
        compare_dir.mkdir(parents=True, exist_ok=True)

        file_path = compare_dir / "custom_analysis_result.json"
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        log(f"[File] Custom tag file saved: {file_path.name}")

        analyze_rss_embeddings()
        return {"status": "ok", "file": file_path.name, "rss": "updated"}

    except Exception as e:
        log(f"[RSS] Error occurred while saving or executing RSS: {e}")
        log(traceback.format_exc())
        return JSONResponse({"error": str(e)}, status_code=500)
    
# ======================================================
# save RSS setting
# ======================================================
@app.post("/save_rss_settings")
async def save_rss_settings(req: Request):
    try:
        data = await req.json()

        backend_dir = Path(__file__).resolve().parent
        project_dir = backend_dir.parent
        rss_dir = project_dir / "rss"
        rss_setting_dir = rss_dir / "rss_setting"
        rss_setting_dir.mkdir(parents=True, exist_ok=True)

        file_path = rss_setting_dir / "rss_settings.json"
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        log(f"[RSS] Settings saved: {file_path}")

        rss_summary_path = rss_dir / "rss_summary.json"
        history_days = int(data.get("historyDays", 14))
        cutoff_dt = datetime.now(timezone.utc) - timedelta(days=history_days)

        if rss_summary_path.exists():
            try:
                with open(rss_summary_path, "r", encoding="utf-8") as f:
                    summary_data = json.load(f)

                articles = summary_data.get("data", [])
                log(f"[RSS] rss_summary.json contains {len(articles)} articles.")

                kept = []
                removed = 0

                for art in articles:
                    pub_dt = parse_rss_datetime(art.get("published", ""))
                    if pub_dt and pub_dt.astimezone(timezone.utc) < cutoff_dt:
                        removed += 1
                    else:
                        kept.append(art)

                if removed > 0:
                    
                    feed_counter = Counter([a.get("source", "") for a in kept])
                    merged_feeds = [{"source": k, "count": v} for k, v in feed_counter.items()]

                    summary_data.update({
                        "updated": datetime.now(timezone.utc).isoformat(),
                        "total": len(kept),
                        "feeds": merged_feeds,
                        "data": kept
                    })
                    with open(rss_summary_path, "w", encoding="utf-8") as f:
                        json.dump(summary_data, f, ensure_ascii=False, indent=2)

                    log(f"[RSS] Cleaned {removed} old articles (>{history_days} days), kept {len(kept)}.")
                else:
                    log("[RSS] No outdated articles found, skipping cleanup.")

            except Exception as e:
                log(f"[RSS] Error while cleaning rss_summary: {e}")
        else:
            log("[RSS] rss_summary.json not found, skipping cleanup.")

        try:
            if rss_summary_path.exists():
                with open(rss_summary_path, "r", encoding="utf-8") as f:
                    summary_data = json.load(f)

                articles = summary_data.get("data", [])
                if not articles:
                    log("[RSS] No articles to check for source removal.")
                else:
                    current_feed_urls = set(data.get("feeds", []))
                    active_sources = []
                    for url in current_feed_urls:
                        try:
                            feed = feedparser.parse(url)
                            if hasattr(feed, "feed"):
                                if hasattr(feed.feed, "title") and feed.feed.title.strip():
                                    active_sources.append(feed.feed.title.strip())
                                else:
                                    from urllib.parse import urlparse
                                    domain = urlparse(url).netloc.replace("www.", "")
                                    active_sources.append(domain)
                        except Exception:
                            pass

                    removed_articles = [a for a in articles if a.get("source", "").strip() not in active_sources]
                    kept_articles = [a for a in articles if a.get("source", "").strip() in active_sources]
                    
                    feed_counter = Counter([a.get("source", "") for a in kept_articles])
                    merged_feeds = [{"source": k, "count": v} for k, v in feed_counter.items()]

                    summary_data.update({
                        "data": kept_articles,
                        "feeds": merged_feeds,
                        "total": len(kept_articles),
                        "updated": datetime.now(timezone.utc).isoformat()
                    })

                    with open(rss_summary_path, "w", encoding="utf-8") as f:
                        json.dump(summary_data, f, ensure_ascii=False, indent=2)

                    if removed_articles:
                        removed_sources = sorted(set(a.get("source", "") for a in removed_articles))
                        log(f"[RSS] Removed {len(removed_articles)} articles from deleted sources: {removed_sources}")
                    else:
                        log(f"[RSS] No removed sources detected.")

        except Exception as e:
            log(f"[RSS] Source cleanup failed: {e}")
            log(traceback.format_exc())

        try:
            if rss_summary_path.exists():
                with open(rss_summary_path, "r", encoding="utf-8") as f:
                    summary_data = json.load(f)

                total_articles = summary_data.get("total", len(summary_data.get("data", [])))
                log(f"[RSS] Total article: {total_articles}")
            else:
                log("[RSS] rss_summary.json not found.")
        except Exception as e:
            log(f"[RSS] Error while counting total articles: {e}")
            log(traceback.format_exc())

       
        # embedding
        analyze_rss_embeddings()
        log("[RSS] Recommendation analysis completed.")

        # auto update
        global auto_update_thread, auto_update_flag

        interval_hours = float(data.get("updateIntervalHours", 0))
        if interval_hours > 0:
            if auto_update_flag:
                auto_update_flag = False
                time.sleep(0.5)
                log("[AutoUpdate] Previous background thread stopped, restarting...")

            auto_update_flag = True
            auto_update_thread = threading.Thread(
                target=auto_update_worker,
                args=(interval_hours,),
                daemon=True
            )
            auto_update_thread.start()
            log(f"[AutoUpdate] New background task started (interval = {interval_hours}h)")

        else:
            if auto_update_flag:
                auto_update_flag = False
                log("[AutoUpdate] Interval set to 0 → background task stopped.")
            else:
                log("[AutoUpdate] Auto update disabled (interval = 0).")

        return {
            "status": "ok",
            "file": str(file_path),
            "rss": "analyzed_after_cleanup",
            "auto_update": "started" if interval_hours > 0 else "stopped",
            "interval_hours": interval_hours
        }

    except Exception as e:
        log(f"[RSS] Error while saving settings or executing RSS: {e}")
        log(traceback.format_exc())
        return JSONResponse({"error": str(e)}, status_code=500)
    

# ======================================================
# RSS update
# ======================================================
@app.post("/update_rss")
async def update_rss(req: Request):
    try:
        log("[RSS] Update request received — starting fetch and analysis...")

        backend_dir = Path(__file__).resolve().parent
        project_dir = backend_dir.parent
        rss_dir = project_dir / "rss"
        rss_setting_dir = rss_dir / "rss_setting"
        rss_setting_dir.mkdir(parents=True, exist_ok=True)
        rss_setting_path = rss_setting_dir / "rss_settings.json"

        default_feeds = [
            "https://feeds.bbci.co.uk/news/world/rss.xml",
            "https://feeds.bbci.co.uk/news/technology/rss.xml",
            "https://techcrunch.com/feed/",
            "https://www.theverge.com/rss/index.xml",
            "https://github.blog/feed/",
            "https://hnrss.org/frontpage"
        ]

        if rss_setting_path.exists():
            with open(rss_setting_path, "r", encoding="utf-8") as f:
                settings = json.load(f)
        else:
            settings = {}

        settings["enabled"] = True  
        if not settings.get("feeds"):
            settings["feeds"] = default_feeds  

        with open(rss_setting_path, "w", encoding="utf-8") as f:
            json.dump(settings, f, ensure_ascii=False, indent=2)

        log(f"[RSS] Updated settings (only enabled + feeds patched): {settings}")

        articles = fetch_rss_articles()
        analyze_rss_embeddings()

        log(f"[RSS] Update completed — fetched {len(articles)} articles.")
        return {
            "status": "ok",
            "rss": "updated",
            "count": len(articles),
            "message": "RSS updated successfully"
        }
    except Exception as e:
        log(f"[RSS] Error during update: {e}")
        log(traceback.format_exc())
        return JSONResponse({"error": str(e)}, status_code=500)

# ======================================================
# clear RSS 
# ======================================================
@app.post("/clear_rss_cache")
async def clear_rss_cache(req: Request):
    try:
        log("[RSS] Clear cache request received — starting cleanup")

        backend_dir = Path(__file__).resolve().parent
        project_dir = backend_dir.parent
        rss_dir = project_dir / "rss"

        deleted_files = []
        for file_path in rss_dir.glob("*.json"):
            try:
                file_path.unlink()
                deleted_files.append(file_path.name)
            except Exception as e:
                log(f"[RSS] Failed to delete {file_path.name}: {e}")

        rss_setting_dir = rss_dir / "rss_setting"
        for f in rss_setting_dir.glob("*.json"):
            if f.name != "rss_settings.json":
                f.unlink()
                deleted_files.append(f"rss_setting/{f.name}")

        log(f"[RSS] Deleted {len(deleted_files)} cached files: {deleted_files}")
        return {"status": "ok", "deleted": deleted_files, "message": "Clear RSS"}

    except Exception as e:
        log(f"[RSS] Error occurred while clearing cache: {e}")
        log(traceback.format_exc())
        return JSONResponse({"error": str(e)}, status_code=500)


# ======================================================
# RSS summary
# ======================================================
@app.get("/rss_status")
async def rss_status():
    try:
        backend_dir = Path(__file__).resolve().parent
        project_dir = backend_dir.parent
        rss_dir = project_dir / "rss"
        summary_path = rss_dir / "rss_summary.json"
        def get_dir_size_mb(folder: Path) -> float:
            total_bytes = 0
            for f in folder.rglob("*"):
                if f.is_file():
                    total_bytes += f.stat().st_size
            return round(total_bytes / (1024 * 1024), 2)

        file_size_mb = get_dir_size_mb(rss_dir)
        if not summary_path.exists():
            return {
                "exists": False,
                "total_articles": 0,
                "file_size_mb": file_size_mb,
                "updated_at": None
            }

        with open(summary_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        total_articles = data.get("total", len(data.get("data", [])))
        updated_at = data.get("updated", datetime.now().isoformat())

        return {
            "exists": True,
            "total_articles": total_articles,
            "file_size_mb": file_size_mb,
            "updated_at": updated_at
        }

    except Exception as e:
        log(f"[RSS] Failed to retrieve RSS status: {e}")
        log(traceback.format_exc())
        return JSONResponse({"error": str(e)}, status_code=500)
    


# ======================================================
# system check
# ======================================================
def system_check():
    print("=" * 66)
    print("LocalAI_analyse System Check")
    print("=" * 66)

    backend_dir = Path(__file__).resolve().parent
    project_dir = backend_dir.parent
    data_dir = backend_dir / "data"
    history_dir = project_dir / "history_compare"
    rss_dir = project_dir / "rss"

    # ------------------------------------------------------
    # 1. Environment
    # ------------------------------------------------------
    print("Environment:")
    try:
        torch_version = torch.__version__
        numpy_version = np.__version__
        device = (
            "mps" if torch.backends.mps.is_available()
            else "cuda" if torch.cuda.is_available()
            else "cpu"
        )
        print(f"   Torch version: {torch_version}")
        print(f"   NumPy version: {numpy_version}")
        print(f"   Active device: {device}")
    except Exception as e:
        print(f"   Environment check failed: {e}")

    # ------------------------------------------------------
    # 2. Model loading
    # ------------------------------------------------------
    print("Model Loading:")
    model_path = data_dir / "sentence-transformers--all-mpnet-base-v2"
    if model_path.exists():
        print(f"   Model folder: {model_path}")
        try:
            model = SentenceTransformer(str(model_path), device="cpu", local_files_only=True)
            print("   Model status: OK (loaded successfully)")
        except Exception as e:
            print(f"   Model status: FAILED ({e})")
    else:
        print("   Model folder: NOT FOUND")

    # ------------------------------------------------------
    # 3. Taxonomy embeddings
    # ------------------------------------------------------
    print("Taxonomy Embeddings:")
    taxonomy_path = data_dir / "taxonomy_embeddings.json"
    if taxonomy_path.exists():
        try:
            with open(taxonomy_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                count = len(data.get("data", []))
            print(f"   Taxonomy file: {taxonomy_path}")
            print(f"   Loaded entries: {count}")
        except Exception as e:
            print(f"   Taxonomy status: FAILED ({e})")
    else:
        print("   Taxonomy file: NOT FOUND")

    # ------------------------------------------------------
    # 4. History exports
    # ------------------------------------------------------
    print("History Data:")
    history_latest = project_dir / "history_exports" / "history_latest.json"
    if history_latest.exists():
        print(f"   History file: {history_latest}")
    else:
        print("   History file: NONE")

    # ------------------------------------------------------
    # 5. Recent analysis results
    # ------------------------------------------------------
    print("Recent Analysis:")
    custom_result = history_dir / "custom_analysis_result.json"
    last_result = history_dir / "last_analysis_result.json"
    if custom_result.exists():
        print(f"   Analysis file: {custom_result}")
    elif last_result.exists():
        print(f"   Analysis file: {last_result}")
    else:
        print("   Analysis file: NONE")

    # ------------------------------------------------------
    # 6. BeautifulSoup enriched cache
    # ------------------------------------------------------
    print("Deep Parsing(BeautifulSoup):")
    enriched = history_dir / "history_enriched.json"
    if enriched.exists():
        print(f"   Enriched cache file: {enriched}")
    else:
        print("   Enriched cache file: NONE")

    # ------------------------------------------------------
    # 7. RSS Settings
    # ------------------------------------------------------
    print("RSS Settings:")
    rss_setting = rss_dir / "rss_setting" / "rss_settings.json"
    if rss_setting.exists():
        print(f"   RSS settings file: {rss_setting}")
    else:
        print("   RSS settings file: NONE")

    # ------------------------------------------------------
    # 8. RSS Summary
    # ------------------------------------------------------
    print("RSS Summary:")
    rss_summary = rss_dir / "rss_summary.json"
    if rss_summary.exists():
        try:
            with open(rss_summary, "r", encoding="utf-8") as f:
                data = json.load(f)
            total = data.get("total", len(data.get("data", [])))
            print(f"   RSS summary file: {rss_summary}")
            print(f"   Total articles: {total}")
        except Exception as e:
            print(f"   RSS summary: FAILED ({e})")
    else:
        print("   RSS summary file: NONE")

    # ------------------------------------------------------
    # 9. RSS Recommendations
    # ------------------------------------------------------
    print("RSS Recommendations:")
    rss_recommend = rss_dir / "rss_recommend.json"
    if rss_recommend.exists():
        print(f"   RSS recommendation file: {rss_recommend}")
    else:
        print("   RSS recommendation file: NONE")

    # ------------------------------------------------------
    # Summary
    # ------------------------------------------------------
    print("\n" + "=" * 66)
    print("System Check Completed.")
    print("=" * 66)


# ======================================================
# START
# ======================================================
if __name__ == "__main__":
    log("LocalAI_analyse backend started: http://127.0.0.1:11668")
    system_check() 
    uvicorn.run(app, host="127.0.0.1", port=11668)


# ======================================================
# ======================================================
# ======================================================
# cd ~/Desktop/Extension_Test_02/backend
# source venv/bin/activate
# python server.py