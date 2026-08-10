# BUILD PLAN — PushPanel (Next.js + SQLite, self-hosted, multi-project web push panel)

> **Goal.** Build a web push notification panel that is **feature-superset of LaraPush** (research/03, 09) with none of its weaknesses (research/10). One panel, one server, many projects/websites. Self-hosted on a VPS via Coolify. Personal-use first, but engineered to professional standards so it can grow into a product.
>
> **Stack (decided):** Next.js (App Router, Node runtime) + TypeScript + better-sqlite3 (WAL) + Drizzle ORM. Push delivery: `web-push` (VAPID) default, FCM optional adapter. Worker + scheduler as Node processes in the same container.
>
> Research baseline: `research/01..13`, especially `03-features.md` (full parity list), `09-panel-feature-spec.md` (module spec), `10-gaps-and-opportunities.md` (what we fix), `11-api-endpoints.md` (their API contract), `12-our-architecture.md` (delivery model), `13-product-roadmap.md` (phases).

> **Status (verified 2026-08-11):** milestones **M0–M7 shipped** on `main` (plus a working M7 exit item — TOTP 2FA, e2e `m11-tfa` passes). The full e2e suite is **43/43 green** on a production build, all packages typecheck + lint clean (0 errors), and a hardening pass added: anonymous-visitor `dev=1` deny, browser-support gate on subscribe, cross-domain LP channel guard with key-signature verification, origin boots allow-list, and adaptive worker cadence (fast poll on work / 60s idle — see `docs/architecture.md` §8). The live feature inventory lives in `docs/parity-matrix.md` (89 rows: 🟢 36 · 🟡 17 · ⚪ 36). Deferred backlog after §20.

---

## 1. Decisions & Non-Goals

**Decided stack**

| Concern | Choice | Why |
|---|---|---|
| App framework | Next.js 15+ (App Router), **Node runtime everywhere**, `output: standalone` | Self-host friendly in Docker/Coolify |
| Language | TypeScript strict | Whole monorepo typed |
| DB | **SQLite via better-sqlite3** (`#:memory:`? no — file), WAL mode, `busy_timeout` | Zero-ops, single file, perfect for self-host. One writer process = no contention |
| ORM | **Drizzle** (`drizzle-orm/better-sqlite3` + `drizzle-kit`) | Typed schema + migrations; small footprint |
| Validation | **Zod** | Shared schemas API ↔ DB ↔ UI |
| Auth | **Auth.js (NextAuth) v5**, Credentials provider, own adapter on SQLite | Session cookies httpOnly, CSRF handled; optional 2FA (TOTP) later |
| Push delivery | **web-push** (`web-push-libs/web-push`): VAPID keys, aes128gcm, TTL/urgency/topic | No Google dependency; works on Chrome/Edge/Firefox/Safari 16+; iOS 16.4+ PWA supported via standard web push endpoint |
| FCM escape hatch | `firebase-admin` as optional provider adapter | Migration path from LaraPush/OneSignal tokens; some users already have Firebase |
| Real-time | **socket.io** (small self-host overhead ok) | Live send feed + "instant delivery notice" |
| Scheduler | `cron-parser` (parse) + in-worker tick loop | matches Larapush crontab UX (crontab.guru compatible) |
| RSS/YouTube feed | `rss-parser` (YouTube channel feeds need no API key) | YouTube & blog automation adapters |
| Geo (subscriber city) | Local **MaxMind GeoLite2 mmdb** (`maxmind` npm) lazy load; no external API at subscribe time | Privacy + no quota |
| UI kit | Tailwind CSS + shadcn/ui + Radix | Accessible, dark mode, professional look |
| Backups | Native SQLite backup (VACUUM INTO) + optional S3/Drive offload (see §Ops) | 7-day retention, tested restore |
| Ops | Docker Compose under Coolify; healthchecks; pino logs | Professional DX |

**Non-goals (for now):** SaaS billing, native mobile apps, multi-node clustering, public marketplace. Design keeps these **possible later** (project-scoped keys, idempotent queue, provider abstraction).

**Key constraint (SQLite concurrency):** single writer at a time. Solution pattern used everywhere:
- ONE exported `db` instance (better-sqlite3, WAL).
- All DAL calls are synchronous; **all writes funnel through the functional `services` layer** (no raw SQL in route handlers).
- Sender worker + API server in the **same container/process tree**; the worker is the only thing writing `deliveries`/`queue` rows *while a campaign is live*, and it processes jobs one batch at a time with short transaction windows (batches of 50–100). UI traffic reads are served from WAL snapshots — readers never block.

---

## 2. Product Model: "One panel — many projects"

Same as "unlimited domains" in LaraPush, modeled cleanly:

```
User (Owner)  ──►  Workspaces (projects/owners)  ──►  Domains (websites)
                        │                                   │
                        ├─ Users/roles (future: owner,      ├─ campaigns
                        │   editor, viewer; single-owner     ├─ segments
                        │   now, schema ready)                ├─ subscribers
                                                              ├─ LP links / YT channels
                                                              └─ automations
```

- **Workspace (project)** = the container for organization; 1–N workspaces; rename/reorder later, no migration risk since every entity has `workspace_id`.
- **Domain** = an actual website with its own push credentials (VAPID keypair or FCM config), prompt settings, subscribers.
- Capability flags on workspaces (`can_use_automation`, `max_domains` …) — mirrors their plan gating but defaults all `true` for owner; lets us sell tiers later without migration.

| Table | owner-tenant column |
|---|---|
| settings | workspace_id |
| domains..all | workspace_id |
| campaigns/segments/templates | workspace_id |
| lp_links, youtube_channels, automations | workspace_id |
| subscribers | domain_id (→ workspace_id via domain) |
| api_keys | workspace_id (scopes domain_id*) |

---

## 3. Monorepo Layout (professional standard)

```
apps/
  web/            # Next.js panel (UI + API route handlers + server actions)
  worker/         # node worker: sender + scheduler + automation + cleanup
packages/
  core/           # pure TS: types, zod schemas, domain services (NO next import)
  db/             # drizzle schema, migrations, seeders, better-sqlite3 factory
  sdk-client/     # client-side push SDK (framework-free JS, build w/ tsup)
  sdk-server/     # endpoint handlers: /s/v1/... used by SDK + service worker
  webhooks/       # outbound webhook client + retry/store
  geo/            # country/state lookup wrapper around mmdb
  telemetry/      # counters (subscribed/delivered/clicked) built on SQLite
  shared/         # env validation, http client helpers, utils
tests/
  unit/ integration/ e2e/
Dockerfile                # multi-stage: build web + worker into one image
docker-compose.yml        # web (8000), worker (3000), optional litestream sidecar
.env.example
.github/workflows/ci.yml  # lint, typecheck, unit, integration, build
```

**Key standards**
- TS `strict`; `noUncheckedIndexedAccess`; ESLint (next/core-web-vitals + plugin:drizzle) + Prettier; Husky pre-commit (lint-staged).
- Conventional Commits; each module has README.
- All DB access through `apps/api/packages/db` repos + `services` in `packages/core`; route handlers are thin adapters (zod-parsed input → service → typed result).
- No `any`, no `@ts-ignore`, no unexported secrets, no dynamic SQL from user input (segments are built from a **whitelist of fields/operators** — stored as JSON, compiled to parameterized SQL).

---

## 4. Data Model — Full SQL (Drizzle schema summary)

(SQLite types; every table uses `INTEGER PRIMARY KEY AUTOINCREMENT` unless noted; all timestamps `TEXT ISO-8601` UTC; JSON stored as TEXT; FKs with `ON DELETE CASCADE` where safe, `RESTRICT` otherwise.)

```sql
-- workspaces (the "project" container)
CREATE TABLE workspaces(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE,
  capabilities_json TEXT NOT NULL DEFAULT '{}',   -- future plan limits
  created_at TEXT, updated_at TEXT
);

-- users (single owner now; schema allows multiple)
CREATE TABLE users(
  id INTEGER PRIMARY KEY, workspace_id INTEGER REFERENCES workspaces(id),
  email TEXT UNIQUE NOT NULL, name TEXT,
  password_hash TEXT,                                   -- argon2id
  totp_secret TEXT, totp_enabled INTEGER DEFAULT 0,
  role TEXT NOT NULL DEFAULT 'owner',                   -- owner|admin|editor|viewer
  last_login_at TEXT, created_at TEXT, updated_at TEXT
);
CREATE TABLE sessions(
  id TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER,  -- unix epoch ms; row deleted on use when expired
  created_at TEXT, ip TEXT
);

-- domains (websites)
CREATE TABLE domains(
  id INTEGER PRIMARY KEY, workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                -- hostname, lowercased, unique per workspace
  provider TEXT NOT NULL DEFAULT 'vapid',   -- vapid | fcm
  provider_config_json TEXT,         -- {vapidPublicKey, vapidPrivateKeyEnc, vapidSubject} or {projectId, apiKey,..., serviceAccountEnc}
  app_config_json TEXT,              -- prompt per domain (see §7), schedule/prompt settings
  status TEXT DEFAULT 'active',      -- active|paused
  subscribers_count INTEGER DEFAULT 0, deliveries_count ... (denormalized counters)
  created_at, updated_at
);
CREATE UNIQUE INDEX idx_domains_ws_name ON domains(workspace_id, name);

-- subscribers
CREATE TABLE subscribers(
  id INTEGER PRIMARY KEY, domain_id INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  token TEXT,                          -- encrypted in storage? plaintext + at-rest AES-256-GCM option
  token_hash TEXT NOT NULL,            -- sha256 for dedupe/lookup (no plaintext search)
  provider TEXT NOT NULL DEFAULT 'vapid',
  device TEXT, os TEXT, browser TEXT,  -- from UA + hints
  country TEXT, state TEXT,            -- from IP (mmdb)
  subscribe_url TEXT, subscribe_at TEXT,
  last_active_at TEXT,
  unsubscribed_at TEXT, unsub_reason TEXT,   -- null = active
  meta_json TEXT
);
CREATE INDEX idx_subs_domain ON subscribers(domain_id, unsubscribed_at);
CREATE INDEX idx_subs_domain_date ON subscribers(domain_id, subscribe_at);
CREATE INDEX idx_subs_domain_geo ON subscribers(domain_id, country, state);
CREATE INDEX idx_subs_domain_dev ON subscribers(domain_id, device, browser, os);
CREATE INDEX idx_subs_hash_uniq ON subscribers(domain_id, token_hash); -- unique via partial index WHERE unsubscribed_at IS NULL

-- campaigns
CREATE TABLE campaigns(
  id INTEGER PRIMARY KEY, workspace_id, domain_id TEXT,      -- domain_id NULL = multi-domain
  title TEXT NOT NULL, message TEXT, icon_url TEXT, image_url TEXT, launch_url TEXT,
  buttons_json TEXT,                                   -- [{label, icon, url}]
  audience_json TEXT NOT NULL,                         -- {kind:'all'|'manual'|'segment', ids:[]}
  schedule_at TEXT, schedule_tz TEXT, scheduled INTEGER DEFAULT 0,
  status TEXT DEFAULT 'draft',                         -- draft|scheduled|sending|paused|done|failed|cancelled
  source TEXT DEFAULT 'panel',                         -- panel|api|wordpress|automation
  template_id INTEGER,
  stats_json TEXT,                                     -- accepted,delivered,clicked,per-button
  created_at, updated_at, sent_at
);
CREATE INDEX idx_campaigns_ws ON campaigns(workspace_id, status, sent_at);

-- templates
CREATE TABLE templates(id, workspace_id, name, title, message, icon_url, image_url, launch_url, buttons_json, …);

-- segments (whitelist-based SQL builder)
CREATE TABLE segments(
  id INTEGER PRIMARY KEY, workspace_id, domain_ids_json TEXT,   -- null = all
  name TEXT, conditions_json TEXT,    -- [{field, op, value}] AND-groups; OR via groups_json later
  estimate_count INTEGER, estimate_at TEXT, last_used_at
);

-- automation
CREATE TABLE automations(
  id INTEGER PRIMARY KEY, workspace_id, domain_id,
  type TEXT NOT NULL,                 -- automagic_dynamic|automagic_static|welcome_push|push_on_publish|youtube_push|drip|webhook
  name TEXT, config_json TEXT,        -- source_url, range, static fields, schedule_cron, prompt opts
  audience_json TEXT, status TEXT DEFAULT 'active',
  last_run_at, next_run_at, error TEXT
);
CREATE INDEX idx_automations_next ON automations(status, next_run_at);

-- lp_links (collection links with redirect)
CREATE TABLE lp_links(
  id INTEGER PRIMARY KEY, workspace_id, domain_id,
  code TEXT UNIQUE, target_url TEXT, prompt_text TEXT,
  force_subscribe INTEGER DEFAULT 0,
  clicks_count INTEGER DEFAULT 0, subscribers_count INTEGER DEFAULT 0,
  deleted_target_url TEXT,   -- fallback after deletion (default 404)
  created_at, updated_at
);

-- youtube_channels
CREATE TABLE youtube_channels(
  id INTEGER PRIMARY KEY, workspace_id, domain_id,
  title TEXT, channel_url TEXT, feed_url TEXT,      -- feed autodiscovered
  prompt_text TEXT, force_subscribe INTEGER DEFAULT 0,
  lp_code TEXT, clicks_count, desktop_subs, mobile_subs, status,
  last_video_at TEXT, last_polled_at TEXT
);

-- deliveries / queue (sender engine)
CREATE TABLE deliveries(
  id INTEGER PRIMARY KEY, campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  subscriber_id INTEGER REFERENCES subscribers(id) ON DELETE SET NULL,
  domain_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',   -- queued|sending|sent|failed|unsubscribed(410)
  attempts INTEGER DEFAULT 0, next_attempt_at INTEGER,
  error TEXT, provider_msg TEXT,
  requested_at INTEGER, sent_at INTEGER
);
CREATE INDEX idx_deliv_camp_status ON deliveries(campaign_id, status, next_attempt_at);
CREATE INDEX idx_deliv_domain ON deliveries(domain_id, status);

-- events (analytics backbone)
CREATE TABLE events(
  id INTEGER PRIMARY KEY, -- monotonic used also for cursor
  domain_id INTEGER NOT NULL, campaign_id INTEGER,
  subscriber_id INTEGER, type TEXT NOT NULL,   -- subscribed|delivered|clicked|unsubscribed|link_click|impression
  meta_json TEXT,   -- button index, target url
  ts TEXT NOT NULL
);
CREATE INDEX idx_events_domain_ts ON events(domain_id, ts);
CREATE INDEX idx_events_camp ON events(campaign_id, type);

-- settings (global panel):
CREATE TABLE settings(key TEXT PRIMARY KEY, value TEXT);
-- backups
CREATE TABLE backups(id, kind TEXT, status TEXT, size_bytes, location TEXT, created_at TEXT);

-- api_keys
CREATE TABLE api_keys(id, workspace_id, domain_id INTEGER NULL, label, token_hash TEXT, scope_json TEXT, last_used_at, expires_at, created_at);

-- audit_log
CREATE TABLE audit_log(id, workspace_id, user_id, action TEXT, entity_type, entity_id, meta_json, ts TEXT);
```

**Denormalized counters** (subscribers_count etc.) kept warm by service layer events; rebuilt by `npm run backfill-counters` after import/cleanup.

**Segment engine rules**
- Stored as JSON `{groups: [{logic:'AND'|'OR', conditions:[{field, op, value}]}]}`.
- Allowed fields: url (contains|starts|…), country (in), state (in), device (in), os (in), browser (in), subscribed_after/before, last_active_after, opened_campaign (campaignId), campaign_total_opens, unsubscribed=false implicit.
- Compiles to **parameterized SQL** against `subscribers JOIN (SELECT ...)`; estimate runs `COUNT(*)`.

---

## 5. Push Delivery Engine (the heart)

### Provider interface (packages/core/src/providers)
```ts
interface PushProvider {
  readonly id: 'vapid'|'fcm';
  validateDomainConfig(domain: Domain): void;
  send(domain: Domain, subscriber: Subscriber, payload: PushPayload): Promise<SendResult>;
}
type SendResult = { status: 'sent' } | { status:'unsubscribed' } | { status:'retry', error:string };
```

### VAPID provider (default)
- Per domain: generate keypair once (`webpush.generateVAPIDKeys()`); `subect` = `mailto:admin@<panel-host>` (configurable) — avoid `https://localhost` subject (Safari rejects `BadJwtToken`).
- `sendNotification(subscription, payload, {TTL: 86400, urgency:'high', topic: campaignId, contentEncoding:'aes128gcm', timeout: 15_000})`.
- Payload = JSON: `{title, body, icon, image, url, buttons, tag: campaignId, cid}`.
- Status mapping:
  - `201` → sent.
  - `404 / 410` → subscriber dead → service marks `unsubscribed` + purges.
  - `429` → retry after `Retry-After`; queue with backoff. Carry per-domain rate limiter (token bucket) + global `sendingSpeedPerSecond`.
- **Delivery/click telemetry**: the service worker sends `delivered` + `clicked` beacons to the panel (`/s/v1/beacon?t=...&cid=...`). Real-click tracking (their only-level metrics) — we record **requested**, **delivered** (SW ack), **clicked** (notificationclick + action click) per campaign and per button.

### FCM provider (optional, compat)
- `firebase-admin` with service-account JSON (paste in UI, **encrypted at rest** with `APP_ENC_KEY`), sends via `messaging.sendEachForMulticast` batches of 500; tokens are FCM tokens; migration from LaraPush tokens possible (their same payload token type).
- Segment/click events still collected via the same SW (SW works for both).

### Queue state machine (deliveries table)
```
queued → sending → sent
           └→ failed → (attempts<max) → queued(delay) 
                 └→ (attempts>=max) → failed(final)
queued/sending → cancelled (campaign cancelled)
410/404 → (auto) unsubscribed
```
- Worker picks per-domain: `SELECT * FROM deliveries WHERE campaign_id=? AND status='queued' AND next_attempt_at<=now ORDER BY id LIMIT 100` — batches of ≤100/db txn, then fire provider calls concurrently (limits = constantPoolSize 50; per-provider p-limit).
- **Idempotency:** every delivery write has `campaign_id+subscriber_id` unique index partial; double claim prevented by `status IN (...) AND ...` conditional update (`UPDATE ... SET status='sending', attempts=attempts+1 WHERE id=? AND status='queued'` counts as single-writer operation).
- Checkpointing: worker commits progress every 100 deliveries (WAL checkpoint freq); crash → unprocessed remain queued; requeue job on startup `WHERE status='sending' AND updated_at< now-10min`.
- Cancel: `UPDATE deliveries SET status='cancelled' WHERE campaign_id=? AND status IN('queued','sending')`.

### Scheduler (cron)
- `cron-parser` parse with app-level timezone (settings.timezone) → `nextRunAt` computed on the fly & persisted per automation (`next_run_at`).
- Worker tick every 60s: `SELECT * FROM automations WHERE status='active' AND next_run_at<=now` (indexed) → dispatch jobs into job queue table (jobs).
- Cron UI: text input + live description + preset chips (hourly/daily/custom) + link crontab.guru (they have it — we keep parity).

---

## 6. Automation feature modules (with parity notes)

| Automation | Parity spec (research/09) | Our improvement / implementation |
|---|---|---|
| **AutoMagic Dynamic** | WP API URL + article range number + Validate button; random pick; cron | Generic **content adapter**: WordPress REST (`/wp-json`), RSS/Atom feed, JSON API (hooks page configurable): validates upstream, sets `last_fetched_id`, picks random within range, auto-pauses with exponential retry if source down; maps title/desc/featured image from atoms. Channel support same UI as LaraPush ("Validate" button). |
| **AutoMagic Static** | fixed title/desc/image/CTA evergreen | same + optional rotation list (pick round-robin from curated posts) |
| **Welcome Push** | auto-send after subscribe | event-driven (on `subscribed` event), rate-limit per domain (1/hr); templates; advanced settings (delay, only-URL-rule via segment) — parity +. |
| **Push on Publish** | WP plugin toggle (Pro) + delay | **Plugin/REST/webhook trio**: WP plugin hook (`save_post` → webhook), plus our own REST trigger endpoint `POST /v1/automations/publish` for generic CMS, RSS poll for Blogger/static; delay option lives in automation config. Not WP-only = real improvement. |
| **YouTube Push** | channel add, LP link, stats | auto-discover channel feed URL (rss-parser from `comments`/channel page), poll 15-min; on new video id → fire campaign; fallback to YouTube Data API v3 if key provided; per-channel active toggle + per-channel desktop/mobile subs (from click-source cookie/UA). |
| **Drip** | marketing "drip notifications" | full sequence builder: start condition (subscribe|event), steps with delay, audience segment per step, stop rule (after N messages or on unsubscribe) — powered by automation `type=drip`. |
| **Webhook → Push** | (not in LaraPush) | `POST /api/v1/webhooks/send` with HMAC signature (see §API), idempotency key — our differentiator. |

All automations share: name, audience (all/manual/segment), preview, pause/resume/delete, last-run + error observability, per-run log table (`automation_runs`).

---

## 7. Integration modules (full parity — 06-integrations.md)

| Integration | Plan |
|---|---|
| **Auto Code Integration** | Global toggle in Settings → General; the panel serves a namespaced header script URL (`/s/{domainKey}/v1/push-client.js`) that the WordPress plugin / any CMS can enqueue automatically. The per-domain generated snippet stays the single source of truth. |
| **WordPress plugin** | PHP plugin distributed as a downloadable zip from the panel; features: one-click send from WP dashboard, push-on-publish (+delay), Web Stories, who-can-send, masked password — full parity with their plugin, but authenticated with a **scoped API key** instead of panel login credentials. |
| **Blogger** | snippet + "I confirm popup" flow + theming (heading, subheading, logo, Allow/Deny labels); their doc explicit — implement as guided steps. |
| **AMP** | `amp-web-push` npm-parts: helper-frame.html + permission-dialog.html auto-generated (AMP validates frames) + widget block, Google Discover safe. |
| **iOS PWA** | both modes (`New PWA` / `Existing PWA`): auto-generate `manifest.json`, `firebase-messaging-sw.js` equivalent **namespaced per domain** (auto code path requires restricting to domain origin), `icon512.png` (up to 2MB zip download); iOS 16.4+ install-flow prompt with `appPromptInstructions`, `reappearTimeSec`. File serving: `/s/{code}/manifest.json`, `/s/{code}/sw.js`, `/s/{code}/permission-dialog.html` (+ icon). |
| **Custom site (manual)** | copy snippet `<head>`, verify, optional 2-file download; cache-clearing helper panel. |

**Snippet files per domain** (served from panel)
- `/s/<domain>/v1/push-client.js` (core: prompts engine + subscribe + sw registration + beacon reporter)
- `/s/<domain>/v1/sw.js|sw-fcm.js` (per provider variant)
- `/s/<domain>/v1/manifest.json`
- `/s/<domain>/v1/icon512.png` (placeholder generated dot/gradient)
- `/s/<domain>/v1/helper-frame.html`, `/s/<domain>/v1/permission-dialog.html` (AMP)
- `/s/<domain>/v1/install-prompt.js` (iOS)

---

## 8. Client SDK spec (packages/sdk-client)

**Single IIFE, ~12-18KB min+gz, zero deps, ES2017+ (fallback ES5 build optional), supports:**
- auto-init on `document.readyState`, one `window.PushSDK` global, safe no-op if unsupported (`!('Notification' in window)`, insecure ctx).
- Config functions-mapped from server-driven `config` JSON via `/<domain>/msn/config` (caches 24h, ETag).
- Prompt engine (4 types + full customization):
  - custom-card (logo, heading, subheading, allow/deny, hide-deny option)
  - custom-card+backdrop
  - default (native `Notification.requestPermission` trigger)
  - full-screen (branded hero layout)
  - advanced: bell widget (bottom location, color, custom unsub), prompt `delaySec`, `reappearSec` (after deny default 7h, config), per-device: desktopOn/mobileOn, positioning (left|center|right), mobile: slide-ups.
  - `beforeinstallprompt` capture (Chrome) expose install prompt variant.
- Subscribe flow: `sw.js` registered only when needed (user gestures → request → pushManager.subscribe(VAPID public key) → `POST panel/api/v1/subscribe {token,meta}`); idempotent server-side (per domain+token).
- **Unsubscribe:** bell unsub → `pushManager.getSubscription().unsubscribe()` + `POST /unsubscribe` + expire; optional "link dead" detection.
- **Notification render**: `showNotification(title,{body,icon,image,badge,actions,data:{cid},silent})`; complete **click beacon**: `event.notification.data` → POST `/events` `{type:'clicked', cid, btn}` (button label optional); close via `notification.close()` after timeout; badge campaignId for dedupe.
- **Beacons batching:** queue events with `navigator.sendBeacon` + fallback `keepalive fetch`; batch ≤10/burst; retry ≤3.
- **iOS extras:** prompt detection for installed-PWA scope (`AppleNotificationPermission` / Web App Push APIs where available, macOS/iOS 18+); "Add to Home Screen" instructions UI (multistep, reappear timer).
- Event hooks for talk to host page: `onSubscribe`, `onDeny`, `onGranted`, `onError` (dev console logs in debug).

**Service worker**
- `install/activate`; `push`: `event.waitUntil(showNotification + beacon delivered)`; `notificationclick`: close + beacon click + open URL (prevent double-open w/ `clients`); `notificationclose` (macOS "close" reports our improved `unsub-sw-close` metric).
- No-op when not configured (config fetch fail → log once).

---

## 9. Panel UI — the full experience (parity + professional)

### Layout
- App shell: slim left sidebar (icon+label), top bar (workspace switcher, global search, "New Campaign" CTA, dark toggle), right theme.
- Pages (mapped 1:1 with research/09 letter design):
  - **Dashboard** — cards: total subscribers (per selected workspace), growth chart (7/30/90d), campaigns sent this month, live delivery feed (WS), quick actions (Quick Push, create campaign, add domain), server stats mini.
  - **Domains** — table with status pill, sub counts, badges (provider), quick actions row (`Clone`, `Integration`, `Import/Export`, `Clean unsubs`, `Re-sync`, `Pause`, `Delete`), collapse to detail drawer: settings accordion = Panel / Prompt / Integration / iOS / AMP / Blogger per tabs; panel validates code (`/verify` icon).
  - **Campaigns** — list w/ filters (status, chronological, search) + detail view w/ real-time charts (requested/delivered/clicked + per-button break-down + table of failed reasons), clone, cancel, reschedule, delete. Editor: single-page form (left form / right sticky preview, same pattern as LaraPush); Fetch content button; Audiences selector (All/Manual/Segment); Schedule (checkbox + date + tz); Advanced (CTA buttons); Send split-button: Send / Send & Create Template / Send & Update Template.
  - **Templates** — cards grid + modal picker at campaign create.
  - **Automation** — left legend: sections (AutoMagic, Publish-on-Push, Welcome, YouTube, Drip, Webhooks→Push); per-type matrices; runner logs.
  - **Segments** — builder w/ live **estimate** (live count), domain filter, JSON preview for advanced, list w/ last-used.
  - **LP Links** — table (target, short URL, clicks, subs, dates), create dialog (target, prompt, force subscribe), share-ready QR, full page script generator (exclude/include domain), delete → optional custom 404 URL.
  - **YouTube Links** — channels table + add; share URL.
  - **Subscribers (Domains→View/Modify)** — paged, filterable (device/browser/country), clean-unsubscribed (with preview of count + confirm), export CSV/JSON, import wizard.
  - **Settings** — General (default audience, sending speed slider + worker count, enable CDN (URL template), UTM, daily cleanup, API access, LP-deleted target), Advanced (allow duplicates API/WP toggle, safe click-beacon domain list), API Keys (generate/revoke/scope), Language & Region (language, timezone, ReadMore text), Profile (name/password/2FA/logout-all), Update (version pill + update button + changelog), Backup (create/schedule/restore/Drive).
  - **Server Status** — Node: uptime, load, memory, DB size, queue depth, last error.

### UX standards
- All lists: server-side pagination + cursors, debounced search, empty states with CTA.
- Forms: Zod validation, dirty-state guards, unsaved-changes modal, loading skeletons (Next streaming).
- Keyboard: global `/` search; quick create `ctrl+n`.
- Dark mode default + light toggle; accessible (a11y: labels, focus ring, aria on toasts/menus, `prefers-reduced-motion`).
- **i18n structure** (next-intl later): all strings via `t()` from JSON messages; panel ships EN (+es/de/hi/tr starter sets by P3).

---

## 10. REST & Public API (professional-grade parity +)

Reuse their endpoint names where sensible (research/11) but better designed:

- Auth: **API keys** (`X-API-Key`), scoped (workspace+domains), rotated, rate-limited (e.g. 60 req/min default; send endpoints can server high-concurrency bursts).
- Response envelope: `{success, data?, error?: {code, message}}` HTTP status honestly (`400/401/403/404/409/429`).
- Endpoints `/api/v1/`:
  - `POST auth/check` (compat with their plugin — email+password → issue short-lived token) — keep only for integration parity, discouraged.
  - `POST campaigns` (fields parity + buttons + schedule) → `{id}`.
  - `POST campaigns/{id}/send` (finalize & release) — our "send" step separates draft/schedule.
  - `GET campaigns`, `GET campaigns/{id}/stats`.
  - `POST /api/v1/domains/{id}/subscribers/import`, `GET .../export` (JSONL: `{provider, token, keys?, ua, ip?, url, ts}`; CSV or JSONL).
  - `POST /api/v1/webhooks/send` (HMAC-signed) — send to list of domains or segment, big automation hook.
  - `GET machine config`, `POST machine/subscribe`, `POST machine/unsubscribe`, `POST machine/events` (SDK only, origin+domain check).
- OpenAPI 3.1 spec (`openapi.ts` export → `/api/docs`) w/ Zod-derived schemas (zod-openapi); mock endpoints for tests.

---

## 11. Security Hardening (checklist)

- **Auth/session** — Auth.js v5 credentials, argon2id hash, session cookie httpOnly secure SameSite=lax (panel over HTTPS required), maxAge 30d + remember toggle; rate-limit login (in-memory token bucket per IP: 5/min, lockout 15 min).
- **CSRF** — SameSite + (with server actions: always-on `origin` check); API keys immune (Bearer, not cookies).
- **Encryption at rest** — `APP_ENC_KEY` (32B hex) encrypts: subscribers.token? **No** — keep plaintext rows for sending performance BUT store `token_hash` and encrypt only `provider_config` + api tokens? Decision: **encrypt `domains.provider_config` (secrets) and `api_keys` full token at rest; tokens (subscriber) stored blinded (hash) for dedupe and store `subscriber.token` AES-256-GCM encrypted with per-key random IV** (enc save ~0.1ms/op with better-sqlite3 buffers — acceptable). Cost-benefit: at-rest protection of personal data.
- **Route guards** — every API + page action enforces auth (middleware) *and* workspace ownership (every service takes `ctx {user, workspaceId}`).
- **SSRF protection** — outbound fetches (fetch-content, WP API, RSS, feed scans) use proxy-based allow-list: deny private/reserved IPs (block list from `ipaddr`), redirects capped 3, user-agent set.
- **Payload size caps** — body ≤1MB requests; notification content ≤ 4KB (push limit 4096 bytes) with soft client truncation hints.
- **Rate limiting** — API-key bucket, SDK subscribe flood control (per domain+IP: 10/min), beacon flood (per IP), login, allow duplicates toggle off.
- **Headers** — CSP, `frame-ancestors 'none'` on panel (SDK domains serve snippets from separate nonce subpath with their own CSP `worker-src 'self'`), X-Content-Type-Options, Referrer-Policy.
- **Audit log** — log: auth (login/success fail), create/send/cancel campaign, export, import, settings change, key create/revoke, backup create/restore, domain actions.
- **Dependency hygiene** — `npm audit` in CI, dependabot, lockfile V3, no runtime eval, no `child_process` in web route.

---

## 12. Analytics & Reporting

**Event pipeline:** all SDK/API events → `events` table (insert, indexed) → **rolled-up** counter tables updated in same transaction or batched (aggregated per day per campaign/domain: `push_channel_daily` (campaign_id,date,requested,delivered,clicked,unsubs,per-button_json)). Rollups run after campaign marked done (and nightly).
Charts (SVG server-rendered or tiny client chart lib — **Recharts** for admin):
- Growth: subscribers line (daily onboarding).
- Campaign funnel: requested→delivered→clicked→per button; ratio %, time-to-click percentiles, per-hour heatmap.
- Delivery health: per-provider error split, dead-tokens removal count.
- LP links: clicks, subs, funnel; YT channels: desktop/mobile split.
- **Real-time**: `/api/stats/live?min|?` SSE → panel live counters while a send runs (streamed deltas).
- Export: CSV (campaigns, subscribers) & JSONL events.

---

## 13. Backup & Restore (their weak point → Ours)

1. **Restore-of-the-DB button** — SQLite-native `VACUUM INTO` snapshot (consistent even under load) + settings; stored to `data/backups/…` with 7-day retention (parity) + optional `RESTORE` upload (parse, validate, replace DB under rename+swap + auto restart worker drain).
2. **Auto-backups** — daily/weekly/monthly schedule (same as panel); each: snapshot + upload.
3. **Offloads** — S3-compatible (MinIO/Coolify volumes/B2/R2/Drive via service-account JSON) using `aws-sdk` minimal put stream; version no crypto → encrypted option (PGP-style w/ APP_ENC_KEY).
4. **Restore tested in CI** (docker compose up with FIXTURE snapshot — assert tables count).
5. **SQLite-level safety** — WAL auto-checkpoint every 4096 pages; nightly `PRAGMA wal_checkpoint(TRUNCATE)` in a maintenance window; documented crash-recovery guide.
> Note: an external Litestream container (`litestream replicate -exec`) can mirror `data/` to S3 continuously — optional sidecar documented in deploy docs; our own manual scheduler is the baseline (personal use).

---

## 14. Deployment / Ops (Coolify + Docker)

```dockerfile
# multi-stage build
FROM node:22-alpine AS deps   # npm ci (frozen lockfile)
FROM node:22-alpine AS build  # turbo build, next build (output standalone)
FROM node:22-alpine AS runtime
  ENV NODE_ENV=production PORT=3000
  COPY apps/web/.next/standalone ./standalone
  COPY apps/web/.next/static ./standalone/apps/web/.next/static
  COPY public ./standalone/apps/web/public
  RUN npm init -y          # minimal standalone
  EXPOSE 3000
  CMD ["node", "standalone/apps/web/server.js"]
```
- **Two processes (web + worker) share one SQLite volume.** Recommended: two services in `docker-compose.yml` on a shared volume (WAL-safe: one writer + concurrent readers):
  - service `web` (Next standalone, port 3000)
  - service `worker` (same image, `CMD ["node","worker-src/index.js"]`, volume `pushdata:/app/data`)
- Volume: `/app/data/pushpanel.db` + WAL files + backups dir.
- **Coolify:** Docker Compose app; env injected from Coolify panel; persist `/app/data`; healthcheck `GET /api/health` returns `{ok, db:'sqlite', version}` → restart on failure.
- Env (`.env.example`):
```
DATABASE_PATH=/app/data/pushpanel.db
APP_URL=https://push.example.com     # required absolute
APP_ENC_KEY=<32 bytes hex>
AUTH_SECRET=<random>
NODE_ENV=production
DEFAULT_TIMEZONE=Asia/Kolkata
SEND_TIMEOUT_MS=15000
WORKER_BATCH_SIZE=100
SENDING_SPEED_PER_SEC=0           # 0 = unlimited (personal)
API_RATE_LIMIT_DEFAULT=10/min
LITESTREAM? (optional)
CACHE_BUSTER=…
```
- Nginx-side termination (Coolify auto TLS); HTTP→HTTPS redirect; HSTS once.
- Backup cron (host) optional.

---

## 15. Observability

- Pino JSON logs (requestId/userId trace); worker logs per job.
- Job-level: campaign progress cards (queued/sending/…), error list with classification table surfaced in UI (not console dump).
- UI: server status page (uptime, memory, load, db size, queue backlog counts, worker version), error summaries.
- Health: `/api/health` (liveness) + `/api/health/ready` (db + migrations applied).
- Metrics: optional Prometheus text format at `/api/metrics` (process + db counters) — off by default (personal).

---

## 16. Testing & QA (professional)

| Level | Tool | What |
|---|---|---|
| Unit | Vitest | providers (vapid/fcm mocks), segment SQL compiler (property tests fixed), scheduler cron parsing, service worker logic (`@vitest/browser`? no — pure functions), backup, queue machine. |
| Integration | Vitest + fresh `:memory:` SQLite per suite | full flows: campaign→queue→worker→consume→failed; automation ticks; import/export round-trip; API v1 happy paths + auth failures; concurrency test (2 workers same db; claiming idempotent). |
| E2E | Playwright (chromium + firefox + webkit headless) | dashboard flows, campaign creation + live preview (on real browser push via test stub), UI seam (permissions stubbed). |
| Perf | `scripts/bench.mjs` — N=10k tokens (fake endpoints stub) → assert send rate & DB ≤ targets | regression gate. |
| CI | GitHub Actions: lint → typecheck → unit → integration (sqlite mem) → build → (manual) e2e | + `npm audit`, prettier check, commitlint. |

---

## 17. Performance Targets

- Panel UI (empty) < 200ms API p95.
- Campaign merge (queue insert speed): ≥ 5k rows/sec (bounded by insert).
- Sending: sustained 500–2k notifications/sec on a $10 VPS (network to VAPID provider is bound), single worker; batch=100; pool=50.
- Search/pagination on 1M subscriber rows: <300ms (indexed).
- Events: 1 campaign of 50k → events 250k rows fine; rollups nightly; retention config (default keep 90d, purge older aggregate).
- Honesty: document *ours*, not "1.5M/min" (personal use).

---

## 18. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| SQLite write contention at blast (campaign going live) | WAL + batch-insert deliveries in one txn (1000 rows), single-writer discipline; volume/backup check before big sends. |
| Provider outage (VAPID endpoint down) | retry w/ exp backoff (cap 5); auto-detected per-provider circuit-breaker; alerts panel banner. |
| Token loss w/o dedupe loops (WP auto-publish) | partial unique (domain+token_hash WHERE unsub IS NULL) + allow-duplicates toggle (parity). |
| FCM migration break (their call) | our tokens providers labels; FCM import via JSONL own format. |
| Long-term reliability of VAPID endpoints (Mozilla Firefox push service etc.) | dual provider ready; manual domain re-key flow. |
| User leaves panel unused | maintenance reminders (dashboard nudge), backup hygiene. |
| Size cap on single DB growth (100M+ sub impractical) | documented limits (100k *sane*); document scale-by-split (per domain files) as future. |

---

## 19. Feature-parity checklist

Every bullet of research/03 §2-§9 gets implemented per spec — the full parity matrix is tracked as `docs/parity-matrix.md` (a PR-review checkbox per feature; 89 features listed there, as-built status 2026-08-11: 🟢 36 · 🟡 17 · ⚪ 36). The matrix doubles as the engineering backlog order.

---

## 20. Delivery timeline (milestone → Git history)

| Milestone | Scope | Exit | Status |
|---|---|---|---|
| **M0 Bootstrap (wk1)** | monorepo, db core, auth, layout, CI | login works, schema migrated | ✅ shipped (`dce7972`) |
| **M1 (wk2-3)** | Domains + SDK v0 VAPID loop (subscribe→campaign→delivery→click beacons) | sandbox single domain push works, e2e pass | ✅ shipped (`25eb79c`) |
| **M2 (wk4)** | Campaigns full editor (fetch-content, schedule, CTA, templates, live preview), quick push, clone | campaign CRUD+send live | ✅ shipped (`35eeeaf`); fetch-content/buttons/quick-push/clone deferred |
| **M3 (wk5)** | Subscribers mgmt (list, clean, export/import), settings (general, advanced, language & region, backup), profile/security | panel v0.1 usable | ✅ shipped (`7c6be48`); most settings knobs deferred |
| **M4 (wk6-7)** | Automations: welcome, push-on-publish (plugin+webhook), AutoMagic (dynamic/static), YouTube | automation suite live | ✅ shipped (`72ab3cc`); cron-text UI, drip deferred |
| **M5 (wk8-9)** | Segments engine + estimates; templates; LP links + full-page script; iOS PWA | growth features | ✅ shipped (`26ff38a`, `6eae228`, `e34ba94`) |
| **M6 (wk10-11)** | WordPress plugin, Blogger, AMP guides; backup UI+offload; live stats, server status; API v1 public + docs; OpenAPI | v1.0 candidate | ✅ shipped (`ab7a95f`, `eed4ada`); backup auto-schedule/offload, per-domain iOS generator deferred |
| **M7 (wk12+)** | i18n, accessibility pass, perf bench, audit log, 2FA, restore testing, readme | **v1.0** → docs, release | ✅ shipped (`cec3118`) + 2FA (TOTP) landed & e2e-green (uncommitted at review time) |

**Post-M7 deferred backlog** (turns 🟡/⚪ rows in `docs/parity-matrix.md`), roughly in value order:

1. Campaign editor depth: CTA buttons editor (B5), fetch-content (B2), quick push (B8), clone campaign/domain (B9/B10), icon/image fields (B1), split-button save-as-template (B7).
2. Settings completeness (G1–G9, G14, G16): sending speed, worker count, UTM/CDN, API/duplicates toggles, profile password change (G15), update module.
3. Backups: auto-schedule (daily/weekly/monthly) + S3/Drive offload and tested restore (G17).
4. Real-time deliverability: socket.io/SSE live feed (B11/E6) + per-button breakdown (E4).
5. SDK prompt engine (F8–F11): 4 prompt types, bell widget, positioning; per-domain iOS generator zip (F7).
6. Automation depth: AutoMagic cron-text UI + crontab preset (C3), auto-pause on source-down (C4), RSS publish poll (C5), YouTube channel page (C7), drip builder (C8).
7. Integrations: Blogger/AMP guided flows + frames (F12/F13), auto code-injection toggle (F15/H2), Web Stories (F14).
8. Data tooling: analytics filters + CSV export (E2/E9), A/B + heatmap (E7/E8), API send + stats (H6/H7), migration importer + panel round-trip (D13/D14), host redirect (G11).
9. Scale/geo: mmdb geo lookup (D2), FCM provider adapter, i18n (G12), perf bench + documented scale limits.

(All phases reflect research/13 roadmap → fine-tuned for solo build.)

---

## 21. Open-source resources & libraries (verified)

| Use | Package/Source | License |
|---|---|---|
| Web push encryption/sending | `web-push-libs/web-push` (web-push on npm) | MIT |
| FCM | `firebase-admin` (Google) | Apache-2.0 |
| SQLite driver | `better-sqlite3` (WiseLibs) | MIT |
| ORM | Drizzle ORM + `drizzle-kit` | Apache-2.0 |
| Validation | `zod` | MIT |
| Auth | Auth.js v5 (`next-auth`) | ISC |
| Cron | `cron-parser` | MIT |
| RSS/opml | `rss-parser` | MIT |
| Geo | `maxmind` + GeoLite2 (free account) | MIT / CC-BY-SA (data) |
| UI kit | shadcn/ui + Radix + Tailwind | MIT |
| Charts | Recharts | MIT |
| Logging | `pino` + `pino-http` | MIT |
| WebSocket | `ws` | MIT |
| S3/Drive | `@aws-sdk/client-s3`; Drive: own REST (or `googleapis`) | Apache-2.0 |
| OSS reference (parity check) | `perfectyorg/perfecty-push-wp` (WP-only, gives SW/AMP patterns), `K0IN/Notify` (webhook→push, tiny) | MIT/GPL |
| Bench | `artillery` (optional) | Apache-2.0 |
| CI | GitHub Actions | – |

---

## 22. First commit checklist (M0 tasks, ready to start)

1. `pnpm init`, monorepo via Turborepo; `.npmrc`, tsconfig base, ESLint, Prettier, simple-conventional-commit bot config.
2. `packages/db`: better-sqlite3 factory + `PRAGMA journal_mode=WAL; busy_timeout=5000`, Drizzle schema for §4 tables + first migration.
3. `apps/web`: Next (App Router) + Tailwind + shadcn/ui scaffold, dark-mode shell, `/api/health`.
4. Auth: Auth.js credentials + first-run owner bootstrap (env `OWNER_EMAIL`), sign-up disabled.
5. Dockerfile + compose + `Dockerfile.worker`; Playwright smoke login; CI (.github) green.
6. README (this file contents ingested as docs index).

> Ready for M1: domain onboarding + `web-push` parity loop + SDK — the first vertical slice that proves the PWA → VAPID → delivery flow, iOS included (document later in `docs/architecture.md`).

---

**Next artifact (after this plan):** `docs/architecture.md` (detailed diagrams), `docs/parity-matrix.md` (the 48-feature checklist), then M0 bootstrap commit. Questions that need your input: panel name/branding, primary workspace language (locale), preference for WP plugin vs only generic REST/webhook first (big fork point), max scale ambition (documented limit values in §10), and whether S3 offload or Google Drive is needed now (wire S3 only).