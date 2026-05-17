import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

function deriveKey(secret) {
  return createHash("sha256").update(String(secret)).digest();
}

export function encryptJson(payload, secret) {
  if (!secret) throw new Error("SESSION_SECRET is required for encryption");
  const key = deriveKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    iv: iv.toString("base64url"),
    tag: tag.toString("base64url"),
    data: encrypted.toString("base64url"),
  };
}

export function decryptJson(blob, secret) {
  if (!secret || !blob?.data) return null;
  try {
    const key = deriveKey(secret);
    const iv = Buffer.from(blob.iv, "base64url");
    const tag = Buffer.from(blob.tag, "base64url");
    const data = Buffer.from(blob.data, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(decrypted.toString("utf8"));
  } catch {
    return null;
  }
}
