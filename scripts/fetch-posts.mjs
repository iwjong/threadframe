/**
 * Fetch Threads posts for GitHub Pages static deploy.
 * Env: THREADS_ACCESS_TOKEN (required), FETCH_INSIGHTS=true (optional)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "data");
const OUT_FILE = path.join(OUT_DIR, "posts.json");
const THREADS_API_BASE = "https://graph.threads.net";
const MAX_PAGES = 30;
const PAGE_LIMIT = 50;
const FETCH_INSIGHTS = /^(1|true|yes)$/i.test(process.env.FETCH_INSIGHTS || "true");
const INSIGHT_DELAY_MS = 120;

const token = process.env.THREADS_ACCESS_TOKEN || process.env.INITIAL_ACCESS_TOKEN;
if (!token || token === "your_long_lived_token") {
  console.error("Set THREADS_ACCESS_TOKEN (GitHub secret) or INITIAL_ACCESS_TOKEN in the environment.");
  process.exit(1);
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  let body = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`Invalid JSON from ${url}`);
    }
  }
  if (!res.ok || body.error) {
    throw new Error(body.error?.message || `HTTP ${res.status} for ${url}`);
  }
  return body;
}

async function fetchAllPosts() {
  const all = [];
  let cursor = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const params = new URLSearchParams({
      fields: "id,media_type,media_url,text,timestamp,thumbnail_url",
      limit: String(PAGE_LIMIT),
      access_token: token,
    });
    if (cursor) params.set("after", cursor);

    const body = await fetchJson(`${THREADS_API_BASE}/v1.0/me/threads?${params}`);
    const batch = body.data || [];
    all.push(...batch);
    cursor = body.paging?.cursors?.after ?? null;
    console.log(`Page ${page + 1}: ${batch.length} posts (${all.length} total)`);
    if (!cursor) break;
  }
  return all;
}

async function fetchLikes(postId) {
  const params = new URLSearchParams({
    metric: "likes",
    access_token: token,
  });
  const body = await fetchJson(`${THREADS_API_BASE}/v1.0/${encodeURIComponent(postId)}/insights?${params}`);
  const likesObj = (body.data || []).find((d) => d.name === "likes");
  return likesObj?.values?.[0]?.value ?? null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchInsightsMap(posts) {
  const insights = {};
  const withMedia = posts.filter((p) => p.media_url || p.thumbnail_url);
  console.log(`Fetching insights for ${withMedia.length} posts...`);
  for (let i = 0; i < withMedia.length; i += 1) {
    const id = withMedia[i].id;
    if (!id) continue;
    try {
      insights[id] = await fetchLikes(id);
    } catch (e) {
      console.warn(`Insights skipped for ${id}: ${e.message}`);
      insights[id] = null;
    }
    if (i < withMedia.length - 1) await sleep(INSIGHT_DELAY_MS);
  }
  return insights;
}

async function main() {
  console.log("Fetching Threads posts...");
  const posts = await fetchAllPosts();
  const payload = {
    generatedAt: new Date().toISOString(),
    posts,
    insights: {},
  };

  if (FETCH_INSIGHTS && posts.length > 0) {
    payload.insights = await fetchInsightsMap(posts);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${posts.length} posts to ${OUT_FILE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
