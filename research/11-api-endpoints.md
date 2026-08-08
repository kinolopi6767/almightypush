# 11 — LaraPush API Endpoints (extracted from WP plugin source + Postman collection)

> **How verified:** The WordPress plugin (`push-notifications-by-larapush` v1.0.10, downloaded from wordpress.org) contains a full REST client against the panel `Host.<panel-url>/api/*` routes, with exact request bodies and response parsing. Cross-checked with the public Postman collection "LaraPush API" (8 items, published Sep 2022) and the panel "Turn on API" setting.

## 0. Global conventions

- **Base URL:** `https://{your-panel-host}/api/...` (Postman: `Host` variable = panel URL, e.g. `https://panel.yourdomain.com`).
- **Auth:** v3/v4-era: **email + password** sent in JSON body on every call (like the panel login). No tokens, no headers beyond Content-Type. (The API toggle in System Settings must be ON — "API Access" enables these routes; it's also the requirement for the WP plugin.)
- **Content-Type:** `application/json`; **Accept:** `application/json`.
- **Response envelope (all endpoints):**
  ```json
  { "success": true|false, "message": "…", "data": {…}?, "plan": "pro"|"premium"|"startup", "version": "5.1.18" }
  ```
  `plan` + `version` are returned by `checkAuth` and let clients gate features (the plugin uses them for gating).
- **Status codes:** 200 + `success:false` on business errors (no 4xx contract enforcement in the plugin; it checks `$body->success` and generic HTTP code).

## 1. `/api/checkAuth` (POST) — validate panel connection

**Request**
```json
{ "email": "...", "password": "..." }
```
**Response** — `success:true` plus:
- `data`: (optionally subscriber stats)
- `plan`: `startup` | `pro` | `premium` (plugin fallback: 'premium')
- `version`: panel version string, e.g. `5.0.0`, `5.1.18` (fallback '1.0.0')

Used for: plugin Settings connection test; gates: push-on-publish delay (plan pro/premium && version ≥ 5.0.0), PWA iOS config (version ≥ 5.1.9), subdirectory installs (≥ 5.0.0).

## 2. `/api/getCampaignFilter` (POST)

Lists the domains the account may send to (campaign domain dropdown).

**Request**
```json
{ "email": "...", "password": "..." }
```
**Response**
```json
{ "success": true, "data": { "domains": [ {"id": 1, "name": "example.com", "…": "…" } ] } }
```

## 3. `/api/codeIntegration` (POST)

Returns the **complete site-integration package** for one domain: JS snippet, service-worker file, AMP frames, PWA manifest + iOS code. The WP plugin writes all of these straight to the site root.

**Request**
```json
{ "email": "...", "password": "...", "domain": "example.com" }
```
**Response** (`data.integration`):
```json
{
  "success": true,
  "data": {
    "integration": {
      "integrationCode": {
        "js_code": "…",                     // embeddable JS (prompt + subscribe)
        "js_code_filename": "lp..js",       // file to write to site root
        "sw_firebase_code": "…",
        "sw_firebase_code_filename": "firebase-messaging-sw.js",
        "header_script": "https://cdn…/sw-register.js",
        "header_additional_js_code": "…"    // extra header snippet (PWA)
      },
      "manifest": { "name": "…", "icons": [ {512} ], "start_url": "…" },
      "pwaIntegrationCode": { "header_additional_js_code": "…" },
      "ampIntegrationCode": {
        "helper_frame_filename": "…", "helper_frame": "<html>…",
        "permission_dialog_filename": "…", "permission_dialog": "<html>…",
        "popup_data": { "bg": "#0F77FF", "button_text": "Subscribe to Notifications", "unsubscribe_button": "Unsubscribe" }
      }
    }
  }
}
```
Interesting notes:
- The panel **generates the files server-side per domain** — the client never constructs them. Your build should do the same (single source of truth for snippet templates).
- AMP gets a **helper frame + permission dialog** files (AMP require iframe-based prompt) — must be plain HTML in site root for AMP validation.
- Header code may be a **remote script URL** (cdn-hosted) or inline (local file); plugin falls back to serving the local js filename.

## 4. `/api/createCampaign` (POST) — send a notification

**Request**
```json
{
  "email": "...",
  "password": "...",
  "domains": [ { "id": "1|2…" } ],          // from getCampaignFilter
  "title": "Post title",
  "message": "14-word description…",
  "icon": "https://site.com/favicon-32.png",
  "image": "https://site.com/featured.jpg",
  "url": "https://site.com/post",
  "schedule_now": 1,                          // 1 = send immediately; 0 + date/time fields = schedule
  "source": "WordPress Plugin"                // attribution string
}
```
**Response:** `{ "success": true, "message": "Campaign created & sent…" }`; `success:false` + `message` on failure.

## 4-8. Other items from the Postman collection (public "LaraPush API", 8 requests, needs panel v3+)

Not downloadable (collection is published, page is client-rendered; exact payloads unavailable), but the 8 requests align with the expected surface:
- **Send push to all subscribers** — like `createCampaign` (likely same endpoint, or v3-era `sendNotification`).
- **Send push to a segment** — campaign with `segment_id`.
- **Send push to selected subscribers** — campaign with explicit subscriber ids.
- **Campaign list / campaign detail** (status, sent/delivered/clicks).
- **Domain/subscriber counts** (home stats).
- **Auth header made** — Postman pre-request reads stored token.

Confirmed stand-in contract until access to a v5 panel (see recommended v1 in 12-our-architecture.md).

## 7. Security/behavior observations to replicate (or improve)

1. **Email+password in body** = the plugin only works while logged-into-panel creds are stored (obfuscated in WP options with a simple ASCII-shift + base64 decode — reversible; not real encryption).
2. **No rate limiting / scopes / API keys** in the v3-v5 flow — any account with API access can createCampaign to all its domains.
3. **No webhooks** — automation is pull-based (WP plugin hooks; APIs hit by external scripts).
4. **Response envelope is consistent** — good pattern to keep, plus add proper status codes + error codes for our API.

## 8. Version-gating facts learned from plugin code (useful for roadmap)

- `plan` + `version` returned by checkAuth → client-side gating: Should plan «startup» gate features (Push-on-Publish **delay** only in pro/premium ≥5.0; PWA iOS ≥5.0.9; subdir installs ≥5.0).
- API endpoints have stayed stable for plugin backwards-compat (1..4 unchanged from v1.0.0 to v1.0.10) — **our API must keep the same contract across versions** (or version it properly via `/api/v2`).