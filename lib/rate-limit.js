export function createRateLimiter({ limitPerMinute = 120 }) {
  const buckets = new Map();
  const windowMs = 60_000;

  function cleanup(now) {
    if (buckets.size < 5000) return;
    for (const [key, entry] of buckets) {
      if (entry.resetAt <= now) buckets.delete(key);
    }
  }

  return {
    allow(key) {
      const now = Date.now();
      cleanup(now);
      let entry = buckets.get(key);
      if (!entry || entry.resetAt <= now) {
        entry = { count: 0, resetAt: now + windowMs };
        buckets.set(key, entry);
      }
      entry.count += 1;
      if (entry.count > limitPerMinute) {
        return {
          ok: false,
          retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
        };
      }
      return { ok: true };
    },
  };
}

export function getClientIp(req, trustProxy) {
  if (trustProxy) {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded) {
      return forwarded.split(",")[0].trim();
    }
  }
  return req.socket?.remoteAddress || "unknown";
}
