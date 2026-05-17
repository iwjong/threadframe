function isTruthy(value) {
  return /^(1|true|yes)$/i.test(String(value || "").trim());
}

function getArgValue(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1) return null;
  return argv[index + 1] || null;
}

export function loadConfig(argv = process.argv) {
  const devMode = argv.includes("--dev") || isTruthy(process.env.DEV_MODE);
  const production =
    process.env.NODE_ENV === "production" || isTruthy(process.env.PRODUCTION);
  const publicUrlRaw = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || "")
    .trim()
    .replace(/\/$/, "");
  const publicWeb = production || (!devMode && Boolean(publicUrlRaw));

  const host =
    getArgValue(argv, "--host") ||
    (devMode ? "127.0.0.1" : process.env.HOST || (publicWeb ? "0.0.0.0" : "threads-sample.meta"));
  const port = parseInt(getArgValue(argv, "--port") || process.env.PORT || "8000", 10);

  const sslCert = process.env.SSL_CERT_FILE;
  const sslKey = process.env.SSL_KEY_FILE;
  const projectRoot = process.env.PROJECT_ROOT || process.cwd();

  const localHttps =
    !devMode &&
    !publicWeb &&
    Boolean(sslCert && sslKey);

  const protocol = devMode || publicWeb ? "http" : "https";
  const baseUrl = publicWeb
    ? publicUrlRaw
    : `${protocol}://${host}:${port}`;
  const redirectUri = publicWeb
    ? `${publicUrlRaw}/callback`
    : `https://${host}:${port}/callback`;

  return {
    devMode,
    production,
    publicWeb,
    localHttps,
    host,
    port,
    protocol,
    baseUrl,
    redirectUri,
    publicUrl: publicUrlRaw || null,
    appId: process.env.APP_ID,
    apiSecret: process.env.API_SECRET,
    sessionSecret: process.env.SESSION_SECRET,
    viewerPassword: process.env.VIEWER_PASSWORD || "",
    adminSetupKey: process.env.ADMIN_SETUP_KEY || "",
    dataDir: process.env.DATA_DIR || "data",
    trustProxy: isTruthy(process.env.TRUST_PROXY) || publicWeb,
    sslCert,
    sslKey,
    projectRoot,
    initialAccessToken: process.env.INITIAL_ACCESS_TOKEN,
    initialUserId: process.env.INITIAL_USER_ID,
    fetchTimeoutMs: 10000,
    rateLimitPerMinute: parseInt(process.env.RATE_LIMIT_PER_MINUTE || "120", 10),
    threadsApiBase: "https://graph.threads.net",
  };
}
