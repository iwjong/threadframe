/**
 * Threadframe server.
 * - Dev: HTTP on 127.0.0.1, token via INITIAL_ACCESS_TOKEN
 * - Local HTTPS: mkcert + custom host for OAuth
 * - Production (public web): HTTP behind TLS proxy, PUBLIC_URL, viewer gate, encrypted token store
 */
import http from "http";
import https from "https";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { loadConfig } from "./lib/config.js";
import { createTokenStore } from "./lib/token-store.js";
import {
  clearViewerCookie,
  createViewerSession,
  isViewerAuthorized,
  parseCookies,
  setViewerCookie,
} from "./lib/session.js";
import { createRateLimiter, getClientIp } from "./lib/rate-limit.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const config = loadConfig();
const PUBLIC_DIR = path.resolve(__dirname, "public");
const SSL_CA_BUNDLE_FILE = process.env.SSL_CA_BUNDLE_FILE || "/etc/ssl/cert.pem";
const SSL_CA_BUNDLE = fs.existsSync(SSL_CA_BUNDLE_FILE)
  ? fs.readFileSync(SSL_CA_BUNDLE_FILE, "utf8")
  : null;

const tokenStore = createTokenStore({
  dataDir: config.dataDir,
  projectRoot: __dirname,
  sessionSecret: config.sessionSecret,
  initialAccessToken: config.initialAccessToken,
  initialUserId: config.initialUserId,
});

const rateLimiter = createRateLimiter({ limitPerMinute: config.rateLimitPerMinute });

const PUBLIC_PATHS = new Set([
  "/login.html",
  "/login.css",
  "/favicon.ico",
]);

function validateProductionConfig() {
  if (!config.publicWeb) return;
  const missing = [];
  if (!config.publicUrl) missing.push("PUBLIC_URL");
  if (!config.sessionSecret) missing.push("SESSION_SECRET");
  if (!config.appId) missing.push("APP_ID");
  if (!config.apiSecret) missing.push("API_SECRET");
  if (missing.length) {
    console.error("Production requires: " + missing.join(", "));
    process.exit(1);
  }
}

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

function applySecurityHeaders(res, { allowCache = false } = {}) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' https: data: blob:; media-src 'self' https: blob:; font-src 'self' https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self'; connect-src 'self'"
  );
  if (!allowCache) {
    res.setHeader("Cache-Control", "no-store");
  }
}

function jsonResponse(res, status, body) {
  applySecurityHeaders(res);
  res.setHeader("Content-Type", "application/json");
  res.writeHead(status);
  res.end(JSON.stringify(body));
}

function redirect(res, location, status = 302) {
  applySecurityHeaders(res);
  res.writeHead(status, { Location: location });
  res.end();
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
    const allowCache = ext !== ".html";
    applySecurityHeaders(res, { allowCache });
    res.setHeader("Content-Type", getMimeType(ext));
    res.writeHead(200);
    res.end(data);
  });
}

async function readJsonBody(req, maxBytes = 4096) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let raw = "";
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("Body too large"));
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

async function fetchJson(url, options = {}) {
  const target = new URL(url);
  const transport = target.protocol === "https:" ? https : http;
  const signal = options.signal || AbortSignal.timeout(config.fetchTimeoutMs);
  const bodyData = options.body instanceof URLSearchParams
    ? options.body.toString()
    : options.body;

  return new Promise((resolve, reject) => {
    const req = transport.request(
      target,
      {
        method: options.method || "GET",
        headers: options.headers || {},
        signal,
        ...(target.protocol === "https:" && SSL_CA_BUNDLE ? { ca: SSL_CA_BUNDLE } : {}),
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          text += chunk;
        });
        res.on("end", () => {
          const response = {
            ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300,
            status: res.statusCode || 0,
          };
          if (!text) {
            resolve({ response, body: {} });
            return;
          }
          try {
            resolve({ response, body: JSON.parse(text) });
          } catch {
            reject(new Error(`Invalid JSON from ${target.pathname}`));
          }
        });
      }
    );

    req.on("error", reject);
    req.setTimeout(config.fetchTimeoutMs, () => {
      req.destroy(new Error("Request timed out"));
    });

    if (bodyData != null) req.write(bodyData);
    req.end();
  });
}

function getUpstreamStatus(response, error, fallback = 502) {
  if (error?.code === 190) return 401;
  if (response?.status >= 400 && response.status <= 599) return response.status;
  return fallback;
}

function getErrorDetail(error) {
  return error?.cause?.code || error?.cause?.message || error?.message || "Unknown error";
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

function getAccessTokenRecord() {
  return tokenStore.getToken();
}

function getMissingTokenMessage() {
  if (config.devMode) {
    return "No access token. Set INITIAL_ACCESS_TOKEN in .env for local UI testing.";
  }
  if (config.publicWeb) {
    return "Threads is not connected. The site owner must complete setup at /auth.";
  }
  return "No access token. Open /auth to connect Threads, or set INITIAL_ACCESS_TOKEN in .env.";
}

function isSecureRequest(req) {
  if (config.publicWeb) return true;
  return config.protocol === "https";
}

function checkRateLimit(req, res) {
  const ip = getClientIp(req, config.trustProxy);
  const result = rateLimiter.allow(ip);
  if (!result.ok) {
    res.setHeader("Retry-After", String(result.retryAfterSec));
    jsonResponse(res, 429, { error: "Too many requests. Try again shortly." });
    return false;
  }
  return true;
}

function requireViewer(req, res) {
  if (!config.viewerPassword) return true;
  if (isViewerAuthorized(req, config, config.sessionSecret)) return true;
  jsonResponse(res, 403, {
    error: "Viewer authentication required.",
    code: "VIEWER_AUTH_REQUIRED",
  });
  return false;
}

function isAdminAuthRequest(req, urlPath) {
  if (!config.adminSetupKey) return true;
  const q = parseQuery(req.url || "");
  return q.key === config.adminSetupKey || parseCookies(req).tf_admin === config.adminSetupKey;
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

  const url = `${config.threadsApiBase}/v1.0/me/threads?${params}`;
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
    jsonResponse(res, 502, { error: "Proxy error", detail: getErrorDetail(e) });
  }
}

async function exchangeCodeForLongLived(code) {
  const codeClean = (code || "").replace(/#_$/, "").trim();
  if (!codeClean || !config.appId || !config.apiSecret) {
    return { error: "Missing code or APP_ID/API_SECRET" };
  }

  const { response: shortRes, body: shortBody } = await fetchJson(`${config.threadsApiBase}/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.appId,
      client_secret: config.apiSecret,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
      code: codeClean,
    }),
  });

  if (!shortRes.ok || shortBody.error || !shortBody.access_token) {
    return {
      error: shortBody.error?.message || `Failed to get short-lived token (${shortRes.status})`,
    };
  }

  const shortToken = shortBody.access_token;
  const userId = shortBody.user_id;
  const { response: longRes, body: longBody } = await fetchJson(
    `${config.threadsApiBase}/access_token?grant_type=th_exchange_token&client_secret=${encodeURIComponent(config.apiSecret)}&access_token=${encodeURIComponent(shortToken)}`
  );

  if (!longRes.ok || longBody.error || !longBody.access_token) {
    return {
      error: longBody.error?.message || `Failed to get long-lived token (${longRes.status})`,
    };
  }

  return {
    access_token: longBody.access_token,
    user_id: userId,
    expires_in: longBody.expires_in,
  };
}

function renderSetupPage(title, message, actionsHtml = "") {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(title)}</title><link rel="stylesheet" href="/login.css"/></head><body class="login-page"><main class="login-card"><h1>${escapeHtml(title)}</h1><p>${message}</p>${actionsHtml}</main></body></html>`;
}

async function onRequest(req, res) {
  const urlPath = req.url?.split("?")[0] || "/";
  const method = req.method;

  if (method === "GET" && urlPath === "/api/status") {
    const record = getAccessTokenRecord();
    jsonResponse(res, 200, {
      connected: Boolean(record?.access_token),
      viewerRequired: Boolean(config.viewerPassword),
      viewerAuthorized: isViewerAuthorized(req, config, config.sessionSecret),
      publicWeb: config.publicWeb,
    });
    return;
  }

  if (method === "POST" && urlPath === "/api/viewer-login") {
    if (!checkRateLimit(req, res)) return;
    if (!config.viewerPassword) {
      jsonResponse(res, 400, { error: "Viewer password is not configured." });
      return;
    }
    try {
      const body = await readJsonBody(req);
      if (body.password !== config.viewerPassword) {
        jsonResponse(res, 401, { error: "Invalid password." });
        return;
      }
      const session = createViewerSession(config.viewerPassword, config.sessionSecret);
      setViewerCookie(res, session, { secure: isSecureRequest(req) });
      jsonResponse(res, 200, { ok: true });
    } catch {
      jsonResponse(res, 400, { error: "Invalid request body." });
    }
    return;
  }

  if (method === "POST" && urlPath === "/api/viewer-logout") {
    clearViewerCookie(res, { secure: isSecureRequest(req) });
    jsonResponse(res, 200, { ok: true });
    return;
  }

  if (method === "GET" && urlPath === "/auth") {
    if (config.devMode) {
      res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
      applySecurityHeaders(res);
      res.end(
        renderSetupPage(
          "OAuth unavailable in dev mode",
          "Use <code>npm start</code> (HTTPS) for OAuth, or set <code>INITIAL_ACCESS_TOKEN</code> in <code>.env</code> for UI work with <code>npm run dev</code>.",
          `<p><a href="/">Back to player</a></p>`
        )
      );
      return;
    }

    if (!config.appId) {
      res.writeHead(500);
      res.end("APP_ID not set");
      return;
    }

    if (config.publicWeb && config.adminSetupKey && !isAdminAuthRequest(req, urlPath)) {
      res.writeHead(403, { "Content-Type": "text/html; charset=utf-8" });
      applySecurityHeaders(res);
      res.end(
        renderSetupPage(
          "Owner setup",
          "Add <code>?key=YOUR_ADMIN_SETUP_KEY</code> to this URL to connect Threads.",
          ""
        )
      );
      return;
    }

    const authUrl = `https://threads.net/oauth/authorize?client_id=${config.appId}&redirect_uri=${encodeURIComponent(config.redirectUri)}&scope=threads_basic,threads_manage_insights&response_type=code`;
    redirect(res, authUrl);
    return;
  }

  if (method === "GET" && urlPath === "/callback") {
    if (config.devMode) {
      res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
      applySecurityHeaders(res);
      res.end(renderSetupPage("Callback unavailable", "Use the HTTPS server for OAuth callbacks."));
      return;
    }

    const q = parseQuery(req.url);
    if (q.error) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      applySecurityHeaders(res);
      res.end(
        renderSetupPage(
          "Authorization denied",
          escapeHtml(q.error_description || q.error),
          '<p><a href="/auth">Try again</a></p>'
        )
      );
      return;
    }

    const result = await exchangeCodeForLongLived(q.code);
    if (result.error) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      applySecurityHeaders(res);
      res.end(
        renderSetupPage(
          "Token exchange failed",
          escapeHtml(result.error),
          '<p><a href="/auth">Try again</a></p>'
        )
      );
      return;
    }

    const saved = tokenStore.saveToken(result.access_token, result.user_id, result.expires_in);
    const days = tokenExpiryDays(result.expires_in);
    const persistNote = saved.ok
      ? "Your Threads account is connected. Tokens are stored encrypted on the server only."
      : `Connected, but token could not be saved to disk (${escapeHtml(saved.error)}). Set <code>INITIAL_ACCESS_TOKEN</code> in your hosting environment variables.`;

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    applySecurityHeaders(res);
    res.end(
      renderSetupPage(
        "Threads connected",
        `${persistNote} Session valid for about ${days ?? "unknown"} days.`,
        '<p><a class="login-submit" href="/">Open Frame Player</a></p>'
      )
    );
    return;
  }

  const isApi = urlPath.startsWith("/api/");
  if (isApi) {
    if (!checkRateLimit(req, res)) return;
    if (!requireViewer(req, res)) return;
  }

  if (method === "GET" && urlPath === "/api/posts") {
    const record = getAccessTokenRecord();
    const token = record?.access_token;
    if (!token) {
      jsonResponse(res, 401, { error: getMissingTokenMessage(), code: "THREADS_NOT_CONNECTED" });
      return;
    }
    await handleApiPosts(req, res, token);
    return;
  }

  if (method === "GET" && urlPath === "/api/insights") {
    const record = getAccessTokenRecord();
    const token = record?.access_token;
    if (!token) {
      jsonResponse(res, 401, { error: getMissingTokenMessage(), code: "THREADS_NOT_CONNECTED" });
      return;
    }

    const q = parseQuery(req.url);
    const id = q.id;
    if (!id) {
      jsonResponse(res, 400, { error: "Missing id" });
      return;
    }

    const insightsUrl = `${config.threadsApiBase}/v1.0/${encodeURIComponent(id)}/insights?metric=likes&access_token=${encodeURIComponent(token)}`;
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
      jsonResponse(res, 502, { error: "Insights error", detail: getErrorDetail(e) });
    }
    return;
  }

  if (method === "GET") {
    const needsViewer =
      config.viewerPassword &&
      !PUBLIC_PATHS.has(urlPath) &&
      !urlPath.startsWith("/vendor/");

    if (needsViewer && !isViewerAuthorized(req, config, config.sessionSecret)) {
      if (urlPath === "/" || urlPath === "/index.html") {
        redirect(res, "/login.html?return=" + encodeURIComponent("/"));
        return;
      }
      if (!urlPath.startsWith("/api/")) {
        redirect(res, "/login.html?return=" + encodeURIComponent(urlPath));
        return;
      }
    }

    if (urlPath === "/" || urlPath === "/index.html") {
      serveFile("index.html", res);
      return;
    }
    serveFile(urlPath.slice(1), res);
    return;
  }

  res.writeHead(404);
  res.end();
}

function start() {
  validateProductionConfig();

  const hasCert =
    config.sslCert &&
    config.sslKey &&
    fs.existsSync(path.join(__dirname, config.sslKey)) &&
    fs.existsSync(path.join(__dirname, config.sslCert));

  if (config.localHttps && !hasCert) {
    console.error("Missing SSL cert/key. Run: mkcert threads-sample.meta");
    process.exit(1);
  }

  const listener = (req, res) => {
    onRequest(req, res).catch((e) => {
      console.error(e);
      if (!res.headersSent) jsonResponse(res, 500, { error: "Server error" });
    });
  };

  const server = config.localHttps
    ? https.createServer(
        {
          key: fs.readFileSync(path.join(__dirname, config.sslKey)),
          cert: fs.readFileSync(path.join(__dirname, config.sslCert)),
        },
        listener
      )
    : http.createServer(listener);

  server.listen(config.port, config.host, () => {
    console.log(`Server running at ${config.baseUrl}`);
    if (config.devMode) console.log("Dev mode: HTTP, OAuth disabled.");
    if (config.publicWeb) {
      console.log("Public web mode: TLS expected from hosting proxy.");
      if (config.viewerPassword) console.log("Viewer password gate: enabled.");
      else console.warn("VIEWER_PASSWORD is not set — /api routes are open to anyone.");
      if (config.adminSetupKey) console.log("Admin setup key required for /auth.");
      else console.warn("ADMIN_SETUP_KEY is not set — /auth is open to anyone.");
    }
    if (tokenStore.hasToken()) {
      console.log("Threads token available.");
    } else if (config.devMode) {
      console.log("No token. Set INITIAL_ACCESS_TOKEN in .env for local testing.");
    } else {
      console.log("No token. Owner should open /auth to connect Threads.");
    }
  });
}

start();
