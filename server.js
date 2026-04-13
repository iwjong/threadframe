/**
 * Threadframe server.
 * - Production: HTTPS + custom host for Threads OAuth
 * - Dev mode: HTTP on 127.0.0.1 for local UI work without hosts/cert setup
 */
import "dotenv/config";
import http from "http";
import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

function getArgValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
}

function isTruthy(value) {
  return /^(1|true|yes)$/i.test(String(value || "").trim());
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEV_MODE = process.argv.includes("--dev") || isTruthy(process.env.DEV_MODE);
const APP_ID = process.env.APP_ID;
const API_SECRET = process.env.API_SECRET;
const HOST = getArgValue("--host") || (DEV_MODE ? "127.0.0.1" : (process.env.HOST || "threads-sample.meta"));
const PORT = parseInt(getArgValue("--port") || process.env.PORT || "8000", 10);
const SSL_CERT = process.env.SSL_CERT_FILE;
const SSL_KEY = process.env.SSL_KEY_FILE;
const INITIAL_ACCESS_TOKEN = process.env.INITIAL_ACCESS_TOKEN;

const PROTOCOL = DEV_MODE ? "http" : "https";
const BASE_URL = `${PROTOCOL}://${HOST}:${PORT}`;
const REDIRECT_URI = `https://${HOST}:${PORT}/callback`;
const THREADS_API_BASE = "https://graph.threads.net";
const PUBLIC_DIR = path.resolve(__dirname, "public");
const FETCH_TIMEOUT_MS = 10000;

function getMimeType(ext) {
  const map = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".ico": "image/x-icon",
    ".svg": "image/svg+xml",
  };
  return map[ext] || "application/octet-stream";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => (
    {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    }[char]
  ));
}

function serveFile(filePath, res) {
  const requestedPath = String(filePath || "").replace(/^[\\/]+/, "");
  const fullPath = path.resolve(PUBLIC_DIR, requestedPath);
  if (fullPath !== PUBLIC_DIR && !fullPath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }

    const ext = path.extname(fullPath);
    res.setHeader("Content-Type", getMimeType(ext));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.writeHead(200);
    res.end(data);
  });
}

function jsonResponse(res, status, body) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.writeHead(status);
  res.end(JSON.stringify(body));
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: options.signal || AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const text = await response.text();
  if (!text) return { response, body: {} };

  try {
    return { response, body: JSON.parse(text) };
  } catch {
    const pathname = new URL(url).pathname;
    throw new Error(`Invalid JSON from ${pathname}`);
  }
}

function getUpstreamStatus(response, error, fallback = 502) {
  if (error?.code === 190) return 401;
  if (response?.status >= 400 && response.status <= 599) return response.status;
  return fallback;
}

function getMissingTokenMessage() {
  if (DEV_MODE) {
    return "No access token. In dev mode, set INITIAL_ACCESS_TOKEN in .env. OAuth is disabled in dev mode.";
  }
  return "No access token. Run OAuth: open /auth and add the token to .env.";
}

function parseQuery(url) {
  const i = url.indexOf("?");
  if (i === -1) return {};
  const out = {};
  for (const part of new URL(url, "http://x").searchParams) {
    out[part[0]] = part[1];
  }
  return out;
}

function tokenExpiryDays(expiresIn) {
  if (typeof expiresIn !== "number") return null;
  return Math.floor(expiresIn / 86400);
}

async function handleApiPosts(req, res, token) {
  const q = parseQuery(req.url);
  const limit = Math.min(parseInt(q.limit || "20", 10) || 20, 50);
  const after = q.cursor || "";

  const params = new URLSearchParams({
    fields: "id,media_type,media_url,text,timestamp,thumbnail_url",
    limit: String(limit),
    access_token: token,
  });
  if (after) params.set("after", after);

  const url = `${THREADS_API_BASE}/v1.0/me/threads?${params}`;
  try {
    const { response, body } = await fetchJson(url);
    if (!response.ok || body.error) {
      jsonResponse(
        res,
        getUpstreamStatus(response, body.error),
        { error: body.error?.message || `Threads API error (${response.status})` }
      );
      return;
    }

    const cursor = body.paging?.cursors?.after ?? null;
    jsonResponse(res, 200, { data: body.data || [], cursor });
  } catch (e) {
    jsonResponse(res, 502, { error: "Proxy error", detail: e.message });
  }
}

async function exchangeCodeForLongLived(code) {
  const codeClean = (code || "").replace(/#_$/, "").trim();
  if (!codeClean || !APP_ID || !API_SECRET) {
    return { error: "Missing code or APP_ID/API_SECRET" };
  }

  const { response: shortRes, body: shortBody } = await fetchJson(`${THREADS_API_BASE}/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: APP_ID,
      client_secret: API_SECRET,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT_URI,
      code: codeClean,
    }),
  });

  if (!shortRes.ok || shortBody.error || !shortBody.access_token) {
    return {
      error: shortBody.error?.message || `Failed to get short-lived token (${shortRes.status})`,
      raw: shortBody,
    };
  }

  const shortToken = shortBody.access_token;
  const userId = shortBody.user_id;
  const { response: longRes, body: longBody } = await fetchJson(
    `${THREADS_API_BASE}/access_token?grant_type=th_exchange_token&client_secret=${encodeURIComponent(API_SECRET)}&access_token=${encodeURIComponent(shortToken)}`
  );

  if (!longRes.ok || longBody.error || !longBody.access_token) {
    return {
      error: longBody.error?.message || `Failed to get long-lived token (${longRes.status})`,
      raw: longBody,
      shortToken,
      userId,
    };
  }

  return { access_token: longBody.access_token, user_id: userId, expires_in: longBody.expires_in };
}

async function onRequest(req, res) {
  const url = req.url?.split("?")[0] || "/";
  const method = req.method;

  if (method === "GET" && url === "/auth") {
    if (DEV_MODE) {
      res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        `<!DOCTYPE html><html><body><h1>OAuth unavailable in dev mode</h1><p>Start the HTTPS server with <code>npm start</code> to use Threads OAuth.</p><p>For local UI work, set <code>INITIAL_ACCESS_TOKEN</code> in <code>.env</code> and use <a href="${escapeHtml(BASE_URL)}">${escapeHtml(BASE_URL)}</a>.</p></body></html>`
      );
      return;
    }

    if (!APP_ID) {
      res.writeHead(500);
      res.end("APP_ID not set in .env");
      return;
    }

    const authUrl = `https://threads.net/oauth/authorize?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=threads_basic,threads_manage_insights&response_type=code`;
    res.writeHead(302, { Location: authUrl });
    res.end();
    return;
  }

  if (method === "GET" && url === "/callback") {
    if (DEV_MODE) {
      res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        "<!DOCTYPE html><html><body><h1>Callback unavailable in dev mode</h1><p>Use the HTTPS server for OAuth callbacks.</p></body></html>"
      );
      return;
    }

    const q = parseQuery(req.url);
    if (q.error) {
      const message = escapeHtml(q.error_description || q.error);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        `<!DOCTYPE html><html><body><h1>Authorization denied</h1><p>${message}</p><p><a href="/">Back to Frame</a></p></body></html>`
      );
      return;
    }

    const result = await exchangeCodeForLongLived(q.code);
    if (result.error) {
      const message = escapeHtml(result.error);
      const raw = escapeHtml(JSON.stringify(result.raw || {}, null, 2));
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        `<!DOCTYPE html><html><body><h1>Token exchange failed</h1><pre>${message}</pre><pre>${raw}</pre><p><a href="/auth">Try again</a></p></body></html>`
      );
      return;
    }

    const days = tokenExpiryDays(result.expires_in);
    const token = escapeHtml(result.access_token);
    const userId = escapeHtml(result.user_id);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      `<!DOCTYPE html><html><body><h1>Tokens received</h1><p>Add these to your <code>.env</code> and restart the server.</p><pre>INITIAL_ACCESS_TOKEN=${token}
INITIAL_USER_ID=${userId}</pre><p>Token valid ~${days ?? "unknown"} days.</p><p><a href="/">Open Frame Player</a></p></body></html>`
    );
    return;
  }

  if (method === "GET" && url === "/api/posts") {
    const token = INITIAL_ACCESS_TOKEN;
    if (!token || token === "your_long_lived_token") {
      jsonResponse(res, 401, { error: getMissingTokenMessage() });
      return;
    }
    await handleApiPosts(req, res, token);
    return;
  }

  if (method === "GET" && url === "/api/insights") {
    const token = INITIAL_ACCESS_TOKEN;
    if (!token || token === "your_long_lived_token") {
      jsonResponse(res, 401, { error: getMissingTokenMessage() });
      return;
    }

    const q = parseQuery(req.url);
    const id = q.id;
    if (!id) {
      jsonResponse(res, 400, { error: "Missing id" });
      return;
    }

    const insightsUrl = `${THREADS_API_BASE}/v1.0/${encodeURIComponent(id)}/insights?metric=likes&access_token=${encodeURIComponent(token)}`;
    try {
      const { response, body } = await fetchJson(insightsUrl);
      if (!response.ok || body.error) {
        jsonResponse(
          res,
          getUpstreamStatus(response, body.error),
          { error: body.error?.message || `Insights error (${response.status})` }
        );
        return;
      }

      const data = body.data || [];
      const likesObj = data.find((d) => d.name === "likes");
      const value = likesObj?.values?.[0]?.value ?? null;
      jsonResponse(res, 200, { likes: value });
    } catch (e) {
      jsonResponse(res, 502, { error: "Insights error", detail: e.message });
    }
    return;
  }

  if (method === "GET") {
    if (url === "/" || url === "/index.html") {
      serveFile("index.html", res);
      return;
    }
    serveFile(url.slice(1), res);
    return;
  }

  res.writeHead(404);
  res.end();
}

function start() {
  const hasCert = SSL_CERT && SSL_KEY && fs.existsSync(path.join(__dirname, SSL_KEY)) && fs.existsSync(path.join(__dirname, SSL_CERT));
  if (!DEV_MODE && !hasCert) {
    console.error("Missing SSL cert/key. Run: mkcert threads-sample.meta");
    process.exit(1);
  }

  const listener = (req, res) => {
    onRequest(req, res).catch((e) => {
      console.error(e);
      if (!res.headersSent) jsonResponse(res, 500, { error: "Server error" });
    });
  };

  const server = DEV_MODE
    ? http.createServer(listener)
    : https.createServer(
        {
          key: fs.readFileSync(path.join(__dirname, SSL_KEY)),
          cert: fs.readFileSync(path.join(__dirname, SSL_CERT)),
        },
        listener
      );

  server.listen(PORT, HOST, () => {
    console.log(`Server running at ${BASE_URL}`);
    if (DEV_MODE) {
      console.log("Dev mode enabled (HTTP, no custom host or SSL required).");
    }
    if (INITIAL_ACCESS_TOKEN && INITIAL_ACCESS_TOKEN !== "your_long_lived_token") {
      console.log("Threads token set - use /api/posts to verify (expiry not checked on startup).");
    } else if (DEV_MODE) {
      console.log("No token in .env. Set INITIAL_ACCESS_TOKEN for local UI testing.");
    } else {
      console.log("No token in .env. Open " + BASE_URL + "/auth to get one.");
    }
  });
}

start();
