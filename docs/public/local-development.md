# Local development & server mode

The default deployment is **[GitHub Pages](https://iwjong.github.io/threadframe/)** (static). This guide covers **local HTTPS**, **OAuth**, and optional **Node server** hosting (Render, VPS, Bluehost with Node, etc.).

---

## Prerequisites

| Requirement | Notes |
|-------------|--------|
| Node.js ≥ 20 | [nodejs.org](https://nodejs.org) |
| Meta Developer account | Same account as your Threads profile |
| mkcert | Local HTTPS only (`npm start`) |
| `/etc/hosts` entry | `127.0.0.1 threads-sample.meta` |

Threads **App ID** and **App Secret** come from **App Dashboard → Use Cases → Customize → Settings** (not the top-level Meta app credentials).

---

## Environment

```bash
cp .env.template .env
```

Key variables:

| Variable | Used for |
|----------|----------|
| `APP_ID`, `API_SECRET` | OAuth + server proxy |
| `INITIAL_ACCESS_TOKEN` | Skip OAuth in dev; same value as GitHub secret `THREADS_ACCESS_TOKEN` |
| `SSL_CERT_FILE`, `SSL_KEY_FILE` | `npm start` (mkcert) |
| `PUBLIC_URL`, `SESSION_SECRET` | Production server (`server.js`) |

Never commit `.env` or `*.pem`.

---

## Commands

```bash
npm install
npm run dev      # http://127.0.0.1:8000; needs INITIAL_ACCESS_TOKEN in .env
npm start        # https://threads-sample.meta:8000; OAuth + mkcert
npm run fetch:posts   # build data/posts.json (static / CI)
```

---

## Local HTTPS (mkcert)

Threads OAuth does not accept `localhost` redirects.

1. Add to hosts: `127.0.0.1   threads-sample.meta`
2. Install [mkcert](https://mkcert.org) and run `mkcert -install`
3. In project root: `mkcert threads-sample.meta`
4. Meta app **Redirect Callback URL:** `https://threads-sample.meta:8000/callback`
5. `npm start` → open `https://threads-sample.meta:8000`

---

## Obtain a long-lived token

1. Authorize:  
   `https://threads.net/oauth/authorize?client_id={APP_ID}&redirect_uri=https://threads-sample.meta:8000/callback&scope=threads_basic,threads_manage_insights&response_type=code`
2. Exchange code → short-lived token (POST `/oauth/access_token`).
3. Exchange short → long (GET `/access_token?grant_type=th_exchange_token`).

Or use `/auth` after `npm start`. Store the long-lived token in `.env` as `INITIAL_ACCESS_TOKEN`.

Refresh before ~60 days:

```bash
curl -X GET "https://graph.threads.net/refresh_access_token" \
  -d "grant_type=th_refresh_token" \
  -d "access_token={CURRENT_TOKEN}"
```

---

## Production server mode (optional)

For live `/api/posts` (not static JSON), run `server.js` behind HTTPS with env:

- `NODE_ENV=production` or `PRODUCTION=true`
- `PUBLIC_URL`, `SESSION_SECRET`, `APP_ID`, `API_SECRET`
- Optional: `VIEWER_PASSWORD`, `ADMIN_SETUP_KEY`

See `render.yaml` for Render. Tokens stay server-side; see root `readme.md` security section.

---

## References

- [Threads API: Get Access Tokens](https://developers.facebook.com/docs/threads/get-started/get-access-tokens-and-permissions)
- [postman-api-review.md](./postman-api-review.md)
