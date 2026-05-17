import { createHmac, timingSafeEqual } from "crypto";

const VIEWER_COOKIE = "tf_viewer";
const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 30;

export function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    out[trimmed.slice(0, eq)] = decodeURIComponent(trimmed.slice(eq + 1));
  }
  return out;
}

function signValue(value, secret) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function createViewerSession(viewerPassword, sessionSecret) {
  const payload = `viewer:${viewerPassword}`;
  const sig = signValue(payload, sessionSecret);
  return `${Buffer.from(payload).toString("base64url")}.${sig}`;
}

export function verifyViewerSession(cookieValue, viewerPassword, sessionSecret) {
  if (!cookieValue || !sessionSecret || !viewerPassword) return false;
  const dot = cookieValue.lastIndexOf(".");
  if (dot === -1) return false;
  const encoded = cookieValue.slice(0, dot);
  const sig = cookieValue.slice(dot + 1);
  let payload;
  try {
    payload = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return false;
  }
  const expected = signValue(payload, sessionSecret);
  if (!safeEqual(sig, expected)) return false;
  return payload === `viewer:${viewerPassword}`;
}

export function setViewerCookie(res, token, { secure, maxAgeSec = COOKIE_MAX_AGE_SEC }) {
  const parts = [
    `${VIEWER_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSec}`,
  ];
  if (secure) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

export function clearViewerCookie(res, { secure }) {
  const parts = [
    `${VIEWER_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (secure) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

export function isViewerAuthorized(req, config, sessionSecret) {
  if (!config.viewerPassword) return true;
  const cookies = parseCookies(req);
  return verifyViewerSession(cookies[VIEWER_COOKIE], config.viewerPassword, sessionSecret);
}

export { VIEWER_COOKIE, COOKIE_MAX_AGE_SEC };
