# 12 — Our Architecture Spec (for the better-than-LaraPush product)

> Working title: **PushPanel** (placeholder). Goal: match every LaraPush feature (see 09-panel-feature-spec.md) while fixing the gaps in 10-gaps-and-opportunities.md. This doc is tech-stack-agnostic where possible, but recommends concrete choices to evaluate. It is a *build spec*, not final code.

## 1. Product shape

- **Self-hosted panel** (Docker image + zero-dep installer) AND optional **hosted SaaS** (same codebase, multi-tenant) — one engine, two distribution modes. This kills two birds: LTD market (self-host) + subscription revenue (SaaS) without two codebases.
- **Single artifact:** container image with:
  - **Panel UI** (web app)
  - **Control API** (REST + WebSocket for live stats)
  - **Sender engine** (worker pool, queue-backed)
  - **Automation engine** (triggers + schedulers)
  - **SDK host** (serves per-domain JS + service worker + manifest from one endpoint — like their `/api/codeIntegration`)
  - **Shortlink service** (LP links `/sl/`, YouTube `/yt/`) — separate internal routing module

## 2. Recommended tech (evaluate together)

| Concern | Recommendation | Why |
|---|---|---|
| Panel backend | **Node.js (TypeScript) or Go** | Long-lived HTTP + WebSocket, fast JSON, easy workers; Go if we want single-binary deploy |
| UI | **React + TypeScript + Tailwind**, dark mode, MUI/Radix primitives | Modern admin UX (LaraPush is Bootstrap 4/jQuery — our edge) |
| DB | **PostgreSQL** (primary) + **Redis** (queues/cache/rate) | Relational integrity for segments/analytics; Redis for the send queue & leaderboards |
| Sending | **BullMQ / Redis Streams** + N worker processes | Vertical then horizontal scaling; per-domain worker lanes |
| Real-time | **WebSocket (socket.io)** for panel live stats, delivery ticks | Replaces their polling; "instant delivery notice" that actually streams |
| SDK (client) | **Plain JS (vanilla, ~10-20KB, no deps), ES5+ build**; service worker: **standard push-event handler + VAPID** | Must run on Blogger/AMP/any site without bundlers |
| Push delivery | **Provider abstraction** (see §4): default **VAPID-based (web-push library)**, optional **FCM adapter** for iOS-PWA & Firebase users | Removes the Firebase single-point-of-failure; keeps compatibility |
| Deploy | **Docker Compose** (panel+db+redis) + one-line `curl | bash` installer; SaaS = K8s | Self-host pain is their #1 onboarding complaint |
| Backup | Built-in encrypted SQL dumps + optional S3-compatible / Drive export (service-account JSON) | 10-gap: backups that actually restore tokens |
| API | REST `/api/v1` + OpenAPI; **token-based API keys** (per-domain scoped) | Their email+password auth is a weakness — we do it properly |

## 3. Modules (maps to 09 spec)

```
panel-ui          → React SPA (dashboard, campaigns, automation, segments,
                     LP links, youtube, domains, settings, server status)
control-api       → REST v1 (CRUD + send) + WS live channel + auth
sender-engine     → worker pool; reads campaign queue; fans out per domain
sdk-service       → generates & serves per-domain: push.js, firebase-messaging-sw.js,
                     manifest.json, icon512, AMP helper/dialog frames
shortlink-service → /sl/{code}, /yt/{code} + click tracking (desktop/mobile split)
automation-engine → schedulers (cron), trigger adapters (RSS/WP/webhook/YouTube poll)
analytics-store   → events (subscribed, delivered, clicked, unsubscribed) time-series
backup-service    → scheduled dumps + offload (S3/Drive), 7-day local retention
license-*.         → (self-host) license keys; (SaaS) plan gating
```

## 4. Delivery layer (the differentiator)

**Provider abstraction** — a `PushProvider` interface:
```
interface PushProvider {
  send(token, payload): Result;
  validateCredentials(...): Promise<void>;
  name; capabilities: {iosPwa, amp, bulk, perDomainCreds}
}
```
- **Provider A — VAPID Web Push (default):** panel generates its own VAPID keypair per domain; no Google account needed at all. iOS support via Safari web-push (macOS) — iOS PWA needs APNs route (see B).
- **Provider B — FCM adapter:** same interface; used when (a) customer wants iOS PWA push (FCM→APNs), (b) migrating tokens from LaraPush/OneSignal that are FCM tokens.
- **Future: direct APNs (Safari), Baidu/Mi (China).** Each provider = one adapter; tokens tagged with provider at collection time.
- **Token portability:** export/import includes provider tag + full payload, so migration between panels/providers is lossless (their gap: "different payload structure, can't migrate").

### Sender engine
- Campaign → queue of (domain, token) batches → N workers × (domain lane, provider client pool).
- **Sending speed** = configurable tokens/sec per domain (their "Sending Speed" + our "Worker Count" knobs, but we expose honest telemetry).
- Failure handling: per-token error classes (invalid token → auto-unsub; quota → retry with backoff; provider down → pause lane + alert). Panel shows accepted/sent/failed in real time (WS).
- Per-domain independent lanes → one slow Firebase project doesn't block other domains (their whole-panel knob problem).

## 5. Data model (v1)

```
domains(id, name, provider, provider_config JSON, status, vapid_keys, settings)
subscribers(id, domain_id, token_hash, provider, device, os, browser, country, state,
            subscribe_url, first_seen, last_active, unsubscribed_at, meta JSON)
campaigns(id, domain_ids[], title, message, icon, image, launch_url, buttons JSON,
          audience JSON {all|ids|segment_id}, schedule_at, tz, status, stats JSON)
templates(id, name, title, message, icon, image, launch_url)
segments(id, name, domain_ids[], conditions JSON {and: [{field, op, value}]}, est_size)
lp_links(id, domain_id, code, target_url, prompt_text, force_subscribe, clicks, subs)
yt_channels(id, domain_id, channel_url, prompt_text, force_subscribe, status, stats)
automations(id, type, config JSON, schedule_cron, audience JSON, status, last_run)
events(id, domain_id, subscriber_id?, campaign_id?, type, ts, meta JSON)  -- analytics
api_keys(id, domain_id?, label, token_hash, scopes, last_used)
backups(id, kind, status, size, location, created_at)
users(id, name, email, password_hash, sessions)          -- panel account (single-user v1; roles later)
```

## 6. SDK & integration flow (mirrors their UX, but self-hosted VAPID)

1. Add domain → panel generates provider creds (VAPID pair locally, or paste Firebase config).
2. SDK endpoint `/sdk/{domain}.js` returns the configured snippet (prompt type, bell, delays, readMore label…).
3. Files served: `/{domain}-push.js`, `firebase-messaging-sw.js` (or `push-sw.js`), `manifest.json`, `icon512.png`, AMP `helper-frame.html` + `permission-dialog.html`.
4. Client: prompts (4 types + advanced options), collects token, POSTs `/api/v1/subscribe` (panel validates via user-agent → device/os/browser/country), stores token+meta.
5. **Auto Code Integration**: WP plugin / WordPress route auto-injects header script; Blogger gets pre-`</html>` snippet; AMP gets widget + frames.
6. **Verify flow**: panel fetches `https://{domain}/firebase-messaging-sw.js` (and checks 200) — we add deeper checks (fetch our JS, check `head` contains snippet) — improvement.

## 7. Control API v1 (our contract, improving on theirs)

- `POST /api/v1/auth/check` (email+password → {token, plan, version}) — keep parity for plugin compat.
- `POST /api/v1/auth/keys` (create scoped API key)
- `GET /api/v1/domains` · `POST /api/v1/domains` · `GET /api/v1/domains/{id}/integration` (returns full SDK package — parity with `codeIntegration`)
- `POST /api/v1/campaigns` (body: domains|segment|subscribers, title, message, icon, image, url, buttons, schedule_at) → `{id, status}`
- `GET /api/v1/campaigns/{id}` · `GET /api/v1/campaigns/{id}/stats` (accepted/delivered/clicked + per-button)
- `GET /api/v1/subscribers?segment_id=|filters=` · `POST /api/v1/export` · `POST /api/v1/import` (provider-aware)
- `POST /api/v1/webhooks/{automation_id}` (trigger adapters)
- All error responses: `{success:false, code: "INVALID_SEGMENT", message}` — proper codes, their weakness.

## 8. Security checklist

- Passwords: bcrypt/argon2; API keys stored hashed, scoped per domain, revocable, rate-limited.
- Panel: session cookies httpOnly+secure, CSRF, audit log (add: team roles later).
- Subscriber data: tokens hashed at rest (only sender needs them — store encrypted with panel key; export decrypts on demand).
- License (self-host): offline-friendly license key + signed update manifests; open-core licensing alternative (MIT core, paid extensions) instead of encrypted blobs.
- Trust: automated update integrity (signature check) — their docs just "recommend backup".

## 9. Backups that actually work (gap #1 killer)

- `backups` = SQL dump + subscribers token table encrypted with panel key; auto daily/weekly/monthly; local retention 7 days + offload to S3-compatible/Drive (service-account JSON, their pattern).
- **Restore flow tested in CI** (their documented pain: restore unclear).
- Export format documented (JSONL) — interoperability with OneSignal/TruePush import scripts (migration add-on in a file, not a paid service).

## 10. Non-functional targets

- Single low-RAM VPS: panel idle < 300MB; 100k-subscriber send < 2 min.
- 1.5M/min claim: we set our own honest bench (document in marketing: "X tokens/min on a $6 droplet", measurable in-panel).
- 99.9% component isolation: sender crash never loses campaigns (queue-backed, at-least-once, idempotent tokens).
- Multi-arch Docker (amd64/arm64); installs on Raspberry Pi-class boxes (their server req is Ubuntu 24.04 only).
- Panel available in N languages (their "Language" dropdown implies but doesn't deliver full i18n).

## 11. What we explicitly do NOT copy

- Laravel/PHP, jQuery/Bootstrap admin, ionCube-style encrypted scripts, email+password API auth, cron-only automation, single-provider lock-in, 404'd docs, PDF-guide onboarding.