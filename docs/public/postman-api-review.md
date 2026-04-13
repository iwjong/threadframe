# Threads API Postman Collection Review and Step-by-Step Guide (Public)

> **Postman Collection (Official):** [Meta Threads API](https://www.postman.com/meta/threads/collection/dht3nzz/threads-api?action=share&source=copy-link&creator=52848147)  
> **Official Docs:** [Threads API — Tools and Resources](https://developers.facebook.com/docs/threads/tools-and-resources)

---

## 1. Purpose

This document maps key Threads API requests from the official Postman collection to this prototype's current scope.

It is intentionally sanitized for public sharing:

- no private workspace links
- no account-specific identifiers
- no secrets or token values

---

## 2. Collection Coverage

### 2.1 Authentication

| Category | Method | Endpoint | Purpose |
|----------|--------|----------|---------|
| OAuth start | GET (browser) | `https://threads.net/oauth/authorize` | User login and consent; returns `code` |
| Short-lived token | POST | `https://graph.threads.net/oauth/access_token` | Exchange `code` -> 1-hour token |
| Long-lived token | GET | `https://graph.threads.net/access_token` | Short-lived -> ~60-day token |
| Token refresh | GET | `https://graph.threads.net/refresh_access_token` | Refresh long-lived token |

### 2.2 Retrieve Posts

| Category | Method | Endpoint | Purpose |
|----------|--------|----------|---------|
| My threads list | GET | `https://graph.threads.net/v1.0/me/threads` | Authenticated user's posts |
| Public profile posts | GET | `https://graph.threads.net/v1.0/profile_posts?username={username}` | Public posts for a username |
| Single media | GET | `https://graph.threads.net/v1.0/{threads-media-id}` | Single post detail |

---

## 3. Local Setup Summary

1. Copy `.env.template` to `.env`.
2. Fill in `APP_ID`, `API_SECRET`, and local SSL file paths.
3. Run with HTTPS (`npm start`).
4. Exchange auth code for short-lived token, then long-lived token.
5. Store token values only in local `.env` (never commit).

---

## 4. Validation Flow

1. Import/fork the official Postman collection.
2. Validate OAuth and token exchange.
3. Call `me/threads` with fields and pagination.
4. Compare with local `GET /api/posts` response shape.
5. Run UI checks for image/video playback and navigation.

---

## 5. Security Notes for Public Repos

- Keep `.env`, certs, and private docs out of Git.
- Use placeholders only in examples (`{YOUR_TOKEN}`, `{YOUR_APP_ID}`).
- Rotate credentials immediately if exposed.

