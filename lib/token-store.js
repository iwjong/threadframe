import fs from "fs";
import path from "path";
import { decryptJson, encryptJson } from "./crypto.js";

const PLACEHOLDER = "your_long_lived_token";

export function createTokenStore({ dataDir, projectRoot, sessionSecret, initialAccessToken, initialUserId }) {
  const tokenPath = path.join(projectRoot, dataDir, "threads-token.enc.json");

  function ensureDataDir() {
    const dir = path.dirname(tokenPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  function readFileToken() {
    if (!fs.existsSync(tokenPath)) return null;
    try {
      const raw = JSON.parse(fs.readFileSync(tokenPath, "utf8"));
      return decryptJson(raw, sessionSecret);
    } catch {
      return null;
    }
  }

  function getToken() {
    const fromFile = readFileToken();
    if (fromFile?.access_token && fromFile.access_token !== PLACEHOLDER) {
      return fromFile;
    }
    const envToken = initialAccessToken;
    if (envToken && envToken !== PLACEHOLDER) {
      return {
        access_token: envToken,
        user_id: initialUserId || null,
        source: "env",
      };
    }
    return null;
  }

  function saveToken(accessToken, userId, expiresIn) {
    if (!sessionSecret) {
      return { ok: false, error: "SESSION_SECRET is not configured" };
    }
    try {
      ensureDataDir();
      const payload = {
        access_token: accessToken,
        user_id: userId ?? null,
        expires_in: expiresIn ?? null,
        updated_at: new Date().toISOString(),
      };
      fs.writeFileSync(tokenPath, JSON.stringify(encryptJson(payload, sessionSecret), null, 2), {
        mode: 0o600,
      });
      return { ok: true, persisted: true };
    } catch (e) {
      return { ok: false, error: e.message || "Failed to save token" };
    }
  }

  function hasToken() {
    return Boolean(getToken()?.access_token);
  }

  return { getToken, saveToken, hasToken, tokenPath };
}
