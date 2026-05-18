/**
 * Pre-flight check for CI: validates token env without calling Threads API.
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

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
  return token.replace(/\s+/g, "");
}

function validateToken(token) {
  if (!token || token === PLACEHOLDER) return "missing";
  if (token.length < 40) return "too_short";
  if (/^your_/i.test(token)) return "placeholder";
  if (/^[0-9]+$/.test(token)) return "user_id_not_token";
  if (token.includes("=")) return "env_line_or_wrong_value";
  return null;
}

const raw = process.env.THREADS_ACCESS_TOKEN || process.env.INITIAL_ACCESS_TOKEN || "";
const token = normalizeAccessToken(raw);
const issue = validateToken(token);

if (!raw && !token) {
  console.error(
    "::error::Repository secret missing. Add THREADS_ACCESS_TOKEN (value = INITIAL_ACCESS_TOKEN from .env only)."
  );
  process.exit(1);
}

if (issue) {
  const hints = {
    too_short: "Secret is too short. Paste only the long access token, not API_SECRET or APP_ID.",
    user_id_not_token: "Secret looks like INITIAL_USER_ID. Use INITIAL_ACCESS_TOKEN instead.",
    env_line_or_wrong_value: "Paste only the token value after =, not the full .env line.",
    placeholder: "Replace placeholder with your real long-lived token.",
    missing: "Token is empty after normalization.",
  };
  console.error(`::error::${hints[issue] || "Invalid Threads access token secret."}`);
  process.exit(1);
}

console.log(`Token format OK (${token.length} characters).`);
