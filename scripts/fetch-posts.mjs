/**
 * Fetch Threads posts for GitHub Pages static deploy.
 * Env: THREADS_ACCESS_TOKEN or INITIAL_ACCESS_TOKEN (required)
 * Local: loads .env from project root when present.
 */
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
dotenv.config({ path: path.join(ROOT, ".env") });

const OUT_DIR = path.join(ROOT, "data");
const OUT_FILE = path.join(OUT_DIR, "posts.json");
const THREADS_API_BASE = "https://graph.threads.net";
const MAX_PAGES = 30;
const PAGE_LIMIT = 50;
const FETCH_INSIGHTS = /^(1|true|yes)$/i.test(process.env.FETCH_INSIGHTS || "true");
const INSIGHT_DELAY_MS = 120;
const PLACEHOLDER = "your_long_lived_token";

function normalizeAccessToken(raw) {
  if (!raw) return "";
  let token = String(raw).replace(/^\uFEFF/, "").trim();

  if (/^(INITIAL_ACCESS_TOKEN|THREADS_ACCESS_TOKEN)\s*=/i.test(token)) {
    token = token.replace(/^(INITIAL_ACCESS_TOKEN|THREADS_ACCESS_TOKEN)\s*=/i, "").trim();
  }

  token = token.replace(/^Bearer\s+/i, "").trim();

  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    token = token.slice(1, -1).trim();
  }

  // Strip line breaks / spaces from copy-paste (token must be one continuous string).
  token = token.replace(/\s+/g, "");
  return token;
}

function validateToken(token) {
  if (!token || token === PLACEHOLDER) return "missing";
  if (token.length < 40) return "too_short";
  if (/^your_/i.test(token)) return "placeholder";
  if (/^[0-9]+$/.test(token)) return "user_id_not_token";
  if (token.includes("=")) return "env_line_or_wrong_value";
  return null;
}

function printTokenHelp(issue) {
  console.error("Threads access token is invalid (%s).", issue);
  console.error("");
  console.error("GitHub secret value must be ONLY the token string, for example:");
  console.error("  THAAxxxxxxxx...  (from INITIAL_ACCESS_TOKEN in local .env)");
  console.error("");
  console.error("Do NOT paste:");
  console.error("  - API_SECRET or APP_ID");
  console.error("  - The whole line INITIAL_ACCESS_TOKEN=...");
  console.error("  - Quotes, 'Bearer ', or line breaks");
  console.error("");
  console.error("Update: Settings → Secrets → Actions → THREADS_ACCESS_TOKEN → Update");
}

function resolveToken() {
  return normalizeAccessToken(
    process.env.THREADS_ACCESS_TOKEN || process.env.INITIAL_ACCESS_TOKEN || ""
  );
}

const token = resolveToken();
const tokenIssue = validateToken(token);
if (tokenIssue) {
  printTokenHelp(tokenIssue);
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
    const message = body.error?.message || `HTTP ${res.status} for ${url}`;
    if (/cannot parse access token/i.test(message) || body.error?.code === 190) {
      printTokenHelp("rejected_by_threads_api");
      process.exit(1);
    }
    throw new Error(message);
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
