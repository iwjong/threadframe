# Threadframe — Setup and Testing Guide

> **Version:** 0.1 (Prototype) · **Scope:** Local Testing  
> **References:** [fbsamples/threads_api](https://github.com/fbsamples/threads_api) · [Threads API Docs](https://developers.facebook.com/docs/threads/get-started/get-access-tokens-and-permissions)

---

## Table of Contents

1. [Objective](#1-objective)
2. [Prerequisites](#2-prerequisites)
3. [Threads API Setup](#3-threads-api-setup)
4. [Local HTTPS Setup](#4-local-https-setup)
5. [Obtain Access Tokens](#5-obtain-access-tokens)
6. [Environment Configuration](#6-environment-configuration)
7. [Running the Prototype](#7-running-the-prototype)
8. [Testing Checklist](#8-testing-checklist)
9. [Issue Logging](#9-issue-logging)
10. [Token Maintenance](#10-token-maintenance)
11. [Next Steps After Successful Testing](#11-next-steps-after-successful-testing)
12. [Reference](#12-reference)

---

## 1. Objective

This guide walks through every step required to connect the FREN Frame prototype to a live Threads account, verify that media and captions are retrieved correctly, and confirm the visual display behaves as designed before any further development is scoped.

> **Prototype Goal:** Validate the full data pipeline — Threads API → backend proxy → Frame Player UI — using real account content. No new features are added during this phase.

### Security First (Public Repo)

- Keep real credentials and tokens in local `.env` only.
- Keep local cert/key files out of Git.
- Keep private notes in `docs/private/` (excluded by `.gitignore`).
- Keep shareable docs in `docs/public/`.

---

## 2. Prerequisites

### 2.1 Accounts & Access

| Requirement | Details |
|---|---|
| Meta Developer Account | Must be the **same Meta account** linked to your Threads profile |
| Threads Account | Your target Threads profile must be active |
| Node.js ≥ 20 | https://nodejs.org (LTS recommended) |
| mkcert | Required for local HTTPS — see Section 4 |
| Git | For cloning the prototype repository |
| Admin access to `/etc/hosts` | Required to map a custom local domain |

### 2.2 Critical: Threads API Credentials Are Separate

> ⚠️ The **App ID** and **App Secret** for the Threads API are **NOT** the same as the top-level Meta App credentials. Threads generates its own credentials, found at:
> **App Dashboard → Use Cases → Customize → Settings**
>
> Using the wrong credentials is the most common setup error. Always copy from the Threads-specific settings page.

### 2.3 Local Environment Check

```bash
node -v          # v20.x.x or higher
npm -v           # 10.x.x or higher
mkcert -version  # any version — install if missing
git --version    # any recent version
```

---

## 3. Threads API Setup

> **One-time setup.** Once the Long-lived Token is in your `.env`, skip directly to [Section 7](#7-running-the-prototype) on subsequent sessions.

### 3.1 Create a Meta App

**Step 1 — Go to Meta for Developers**

Open [developers.facebook.com](https://developers.facebook.com) and sign in with the Meta account that owns your target Threads profile.

**Step 2 — Create a New App**

Click **My Apps → Create App**. Select **Other** as the App Type → Next.

**Step 3 — Enable Threads API**

Under **Add a Product**, locate **Threads API** and click **Set Up**.

**Step 4 — Locate the Threads-specific App ID and Secret**

Navigate to **Use Cases → Customize → Settings**. The **App ID** and **App Secret** on this page are the credentials to use throughout this guide.

**Step 5 — Enable Required Permissions**

On the same settings page, enable the following permissions for the app:

| Permission | Purpose |
|---|---|
| `threads_basic` | Read profile info and media — **required** |
| `threads_content_publish` | Publish posts (not needed for read-only Frame prototype) |
| `threads_manage_insights` | Access view counts and engagement data |
| `threads_manage_replies` | Manage replies |
| `threads_read_replies` | Read replies |

For the FREN Frame prototype, **`threads_basic` is the only required permission.**

**Step 6 — Add the Redirect Callback URL**

Under **Redirect Callback URLs**, add:

```
https://threads-sample.meta:8000/callback
```

This domain must exactly match the one configured in Section 4. Threads does **not** accept `localhost` as a valid redirect URL.

---

## 4. Local HTTPS Setup

Threads OAuth requires HTTPS and does not support `localhost` as a redirect URL. You must map a custom domain and generate a local SSL certificate.

### 4.1 Map a Custom Domain

Edit your hosts file to point `threads-sample.meta` to `127.0.0.1`.

**macOS / Linux:**

```bash
sudo nano /etc/hosts
```

Add:

```
127.0.0.1   threads-sample.meta
```

Save and exit (`Ctrl+X`, `Y`, `Enter`).

**Windows:**

Open `C:\Windows\System32\drivers\etc\hosts` as Administrator and add the same line.

---

### 4.2 Install mkcert and Generate a Certificate

**Install:**

```bash
# macOS (Homebrew)
brew install mkcert && mkcert -install

# Linux (Debian/Ubuntu)
sudo apt install mkcert && mkcert -install

# Windows
choco install mkcert
mkcert -install
```

**macOS: If Homebrew reports "directories are not writable"** (e.g. `/usr/local`), either fix ownership once then use Homebrew:

```bash
sudo chown -R $(whoami) /usr/local/Homebrew /usr/local/Cellar /usr/local/bin /usr/local/etc /usr/local/lib /usr/local/opt /usr/local/sbin /usr/local/share /usr/local/var/homebrew
brew install mkcert && mkcert -install
```

Or install the binary without Homebrew (no `sudo` for install; `mkcert -install` may prompt for your password to trust the CA):

```bash
# Download the latest macOS binary (Apple Silicon or Intel)
curl -JLO "https://github.com/FiloSottile/mkcert/releases/latest/download/mkcert-v1.4.4-darwin-amd64.zip"   # Intel
# or
curl -JLO "https://github.com/FiloSottile/mkcert/releases/latest/download/mkcert-v1.4.4-darwin-arm64.zip"   # Apple Silicon (M1/M2/M3)

unzip mkcert-v1.4.4-darwin-*.zip
chmod +x mkcert
sudo mv mkcert /usr/local/bin/
mkcert -install
rm mkcert-v1.4.4-darwin-*.zip
```

> Check [mkcert releases](https://github.com/FiloSottile/mkcert/releases) for the current version and asset names if the URLs above 404.

**Generate the certificate for the local domain:**

```bash
cd /path/to/threadframe
mkcert threads-sample.meta
```

Two files are created in the current directory:

```
threads-sample.meta.pem         ← certificate
threads-sample.meta-key.pem     ← private key
```

Both files must stay in the project root. They are referenced by the backend server for HTTPS.

> If you use a different domain name, replace every instance of `threads-sample.meta` in this guide, in your `/etc/hosts` file, and in the Meta App redirect URL setting.

---

## 5. Obtain Access Tokens

### 5.1 Step 1 — Authorization Code

Open the following URL in your browser. Replace `{YOUR_APP_ID}` with the Threads-specific App ID from Section 3.1, Step 4.

```
https://threads.net/oauth/authorize
  ?client_id={YOUR_APP_ID}
  &redirect_uri=https://threads-sample.meta:8000/callback
  &scope=threads_basic
  &response_type=code
```

Log in with your target Threads account if prompted, then approve the permission request.

The browser redirects to:

```
https://threads-sample.meta:8000/callback?code=AQB...#_
```

> ⚠️ **Strip the trailing `#_`** from the end of the code value. It is appended automatically by Threads but is **not** part of the authorization code. The authorization code can only be used **once**.

---

### 5.2 Step 2 — Short-lived Access Token (valid 1 hour)

```bash
curl -X POST "https://graph.threads.net/oauth/access_token" \
  -F "client_id={THREADS_APP_ID}" \
  -F "client_secret={THREADS_APP_SECRET}" \
  -F "grant_type=authorization_code" \
  -F "redirect_uri=https://threads-sample.meta:8000/callback" \
  -F "code={AUTHORIZATION_CODE}"
```

Successful response:

```json
{
  "access_token": "THQkb...",
  "token_type": "bearer",
  "expires_in": 3600,
  "user_id": "12345678901234567"
}
```

Save both `access_token` and `user_id`.

---

### 5.3 Step 3 — Long-lived Access Token (valid ~60 days)

```bash
curl -X GET "https://graph.threads.net/access_token" \
  -d "grant_type=th_exchange_token" \
  -d "client_secret={THREADS_APP_SECRET}" \
  -d "access_token={SHORT_LIVED_TOKEN}"
```

Successful response:

```json
{
  "access_token": "THQkb...",
  "token_type": "bearer",
  "expires_in": 5183944
}
```

> Divide `expires_in` by `86400` to get remaining days. A fresh token is approximately **60 days**.

Save the long-lived `access_token`. This is the value used in your `.env` file.

---

## 6. Environment Configuration

### 6.1 Create the .env File

```bash
cp .env.template .env
```

Fill in all values:

```bash
# ─── Threads API ───────────────────────────────────────────────────────────────
# Use credentials from: App Dashboard → Use Cases → Customize → Settings
APP_ID=your_threads_specific_app_id
API_SECRET=your_threads_specific_app_secret

# ─── Local server ──────────────────────────────────────────────────────────────
HOST=threads-sample.meta
PORT=8000

# ─── SSL (generated in Section 4.2) ───────────────────────────────────────────
SSL_CERT_FILE=threads-sample.meta.pem
SSL_KEY_FILE=threads-sample.meta-key.pem

# ─── Optional: bypass OAuth on startup ────────────────────────────────────────
# If both values are present, the authentication step is skipped once.
# Useful for rapid iteration on the Frame Player UI without re-authenticating.
INITIAL_ACCESS_TOKEN=your_long_lived_token
INITIAL_USER_ID=your_numeric_threads_user_id
```

### 6.2 Verify .gitignore

```
.env
node_modules/
*.pem
*.log
```

> ⚠️ Both `.env` (contains your token) and `.pem` files (SSL private key) must never be committed to Git.

---

## 7. Running the Prototype

### 7.1 Install Dependencies

```bash
cd threadframe
npm install
```

### 7.2 Start the Server

```bash
npm start

# Expected output:
# ✓  FREN Frame server running at https://threads-sample.meta:8000
# ✓  Threads token valid — expires in 58 days
```

### 7.3 Open the Frame Player

Navigate in your browser to:

```
https://threads-sample.meta:8000
```

**If the browser shows a certificate warning:** `mkcert -install` was not run, or the certificate was generated before installing. Re-run `mkcert -install`, regenerate the certificate, and restart the server.

### 7.4 Troubleshooting: Cannot connect to https://threads-sample.meta:8000

1. **Server must be running.** In a terminal, from the project root run `npm start` and leave it open. You should see `FREN Frame server running at https://threads-sample.meta:8000`.

2. **Use HTTPS.** The URL must be `https://` (not `http://`). Port is `8000`.

3. **Check hosts.** Run `ping threads-sample.meta`. It should resolve to `127.0.0.1`. If not, add `127.0.0.1   threads-sample.meta` to `/etc/hosts`.

4. **Certificate trust.** If the page does not load or shows a connection error, try `https://127.0.0.1:8000/auth`. You may see a certificate warning (domain mismatch); accept it temporarily. If the page then loads, the server is fine and the issue is likely that `mkcert -install` was not run—run it, then use `https://threads-sample.meta:8000` again.

5. **Same machine.** Use the URL on the same computer where the server is running. `threads-sample.meta` resolves only on that machine.

---

## 8. Testing Checklist

> Work through each item in order. Mark each result **PASS**, **FAIL**, or **N/A**. For any FAIL, record details in [Section 9](#9-issue-logging) before continuing.

---

### 8.1 API Connectivity

| # | Test | Expected Result |
|---|---|---|
| 1.1 | Server starts without error | Console shows HTTPS URL and token validity |
| 1.2 | `GET /api/posts` returns 200 | JSON array of post objects, no `error` key |
| 1.3 | `media_type` field present | Value is `IMAGE` or `VIDEO` |
| 1.4 | `media_url` is a valid URL | Begins with `https://` |
| 1.5 | `text` field present | Caption string, or empty string for image-only posts |
| 1.6 | `timestamp` field present | ISO 8601 format, e.g. `2025-03-01T09:15:00Z` |
| 1.7 | Pagination works (`limit=5`) | Returns 5 items with a `cursor` field in response |

---

### 8.2 Frame Player — Images

| # | Test | Expected Result |
|---|---|---|
| 2.1 | Image renders in frame | No broken image icon; fills frame without distortion |
| 2.2 | Ken Burns effect active | Slow zoom/pan visible on still images |
| 2.3 | Ambient background updates | Background blur shifts to match current image palette |
| 2.4 | Progress bar advances | Gold bar fills 0% → 100% over configured duration (default 7s) |
| 2.5 | Auto-advance triggers | Next post loads automatically after bar completes |
| 2.6 | Caption appears with delay | Caption fades in ~400ms after image loads |
| 2.7 | Caption matches post text | Matches the `text` field in the API response |

---

### 8.3 Frame Player — Videos

| # | Test | Expected Result |
|---|---|---|
| 3.1 | Video renders in frame | Video element visible, no black box |
| 3.2 | Video plays automatically | Playback starts without user interaction |
| 3.3 | Video is muted by default | No audio (ambient display mode) |
| 3.4 | Video loops | Restarts from beginning after reaching end |
| 3.5 | Progress bar follows video | Bar advances in sync with video playback |
| 3.6 | Auto-advance after video ends | Next post loads after one full loop |

---

### 8.4 Navigation

| # | Test | Expected Result |
|---|---|---|
| 4.1 | Right arrow key `→` | Advances to next post, resets progress bar |
| 4.2 | Left arrow key `←` | Returns to previous post, resets progress bar |
| 4.3 | Nav dot click | Jumps to corresponding post |
| 4.4 | Active dot highlights | Current dot is gold; others are dimmed |
| 4.5 | Timer resets on manual nav | Auto-advance restarts from 0 after any manual action |

---

### 8.5 Edge Cases

| # | Test | Expected Result |
|---|---|---|
| 5.1 | Post with no caption | Caption area is empty or shows metadata only; no JS error |
| 5.2 | Post with emoji | Renders correctly; no encoding artifacts |
| 5.3 | Post with Korean text | Korean characters display without corruption |
| 5.4 | Caption over 200 characters | Wraps cleanly; does not overflow frame boundary |
| 5.5 | API rate limit (429) | Cached content continues displaying; no crash |
| 5.6 | Network offline | Last cached posts continue displaying |
| 5.7 | Expired / invalid token (401) | Console error logged; UI shows reconnect prompt |

---

## 9. Issue Logging

Record any FAIL results here.

| Test ID | Severity | Observed Behavior | Console Error / Notes |
|---|---|---|---|
| | | | |
| | | | |
| | | | |
| | | | |

**Severity:** `Critical` — blocks testing · `Major` — feature broken · `Minor` — cosmetic or partial

---

## 10. Token Maintenance

### 10.1 Refresh Before Expiry

Long-lived tokens expire after ~60 days. Run this at least every 30 days:

```bash
curl -X GET "https://graph.threads.net/refresh_access_token" \
  -d "grant_type=th_refresh_token" \
  -d "access_token={CURRENT_TOKEN}"
```

Update `.env` with the new token:

```bash
INITIAL_ACCESS_TOKEN=new_token_here
```

### 10.2 Check Remaining Validity

```bash
curl -X GET "https://graph.threads.net/access_token" \
  -d "access_token={YOUR_TOKEN}"

# Response: { "expires_in": 5183944 }
# Divide by 86400 → remaining days
```

> Set a calendar reminder every 30 days. The backend logs a warning when fewer than 10 days remain.

---

## 11. Next Steps After Successful Testing

Once all items in Section 8 pass, the prototype is validated. Prioritized for v0.2:

1. **Automatic token refresh** — `node-cron` job in the server to refresh every 30 days.
2. **Full feed pagination** — page through all media beyond the default 20-item limit.
3. **Spotify-style caption word timing** — word-level spans with staggered fade-in timed to frame duration.
4. **Raspberry Pi kiosk deployment** — `pi-setup.sh` on Pi 4 with 4K display in full-screen mode.
5. **Media type filter** — UI toggle for images only / videos only / all content.

---

## 12. Reference

| Resource | URL |
|---|---|
| **Postman Collection (Threads API)** | https://www.postman.com/meta/threads/collection/dht3nzz/threads-api |
| Postman API review and step-by-step guide (public) | See `docs/public/postman-api-review.md` |
| Docs structure (public/private split) | See `docs/README.md` |
| Threads API — Get Access Tokens & Permissions | https://developers.facebook.com/docs/threads/get-started/get-access-tokens-and-permissions |
| Threads API Changelog | https://developers.facebook.com/docs/threads/changelog |
| Official Sample App | https://github.com/fbsamples/threads_api |
| Meta App Dashboard | https://developers.facebook.com/apps |
| mkcert (local HTTPS) | https://mkcert.org |
| Node.js Download | https://nodejs.org/en/download |
| FREN Frame README | See `README.md` in project root |
