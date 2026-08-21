# PushPanel — Self-Hosted Web Push Panel (Next.js + SQLite)

Build a **better-than-LaraPush** web push notification panel for personal use across many websites/projects: one panel, one VPS (Coolify/Docker), unlimited domains, unlimited subscribers, full campaign/automation/segment/i18n feature set — engineered to professional standards.

## Documents

| Doc | Content |
|---|---|
| **BUILD-PLAN.md** | The master build plan — stack, system design, DB schema, API, SDK, security, ops, milestones |
| **docs/architecture.md** | System diagrams (flows for subscribe/send/automation), services, invariants |
| **docs/parity-matrix.md** | 48+ feature parity checklist against LaraPush |
| **research/** | Deep research on LaraPush (features, docs, API, business, gaps, roadmap) |
| **research/README.md** | Index of the research files |

## Stack

- Next.js (App Router, Node runtime) · TypeScript strict
- better-sqlite3 (WAL) + Drizzle ORM
- web-push (VAPID) default; FCM adapter optional
- Auth.js (credentials), zod, pino, Tailwind + shadcn/ui

## Features (M0–M7)

- **M1** Domains + SDK v0 VAPID loop — subscribe → campaign → delivery → click beacons
- **M2** Campaigns — create/schedule/cancel, worker enqueue, delivery stats
- **M3** Subscribers panel, settings + manual backups (create/delete/download), profile, cleanup job
- **M4** Automations — welcome push, push-on-publish webhook (HMAC-signed), AutoMagic dynamic/static, pause/delete
- **M5** Segments engine (whitelist rule builder + live estimates, segment campaign audiences), templates (pre-fill + template_id), LP links (`/p/{code}` landing funnel: clicks/subscribers, force-subscribe, tombstones), iOS PWA (manifest, install hint, iOS 18 web-push SDK extras)
- **M6** Server status page + `/api/metrics`, OpenAPI spec (`/api/v1/openapi.json`) + API docs page, WordPress plugin (downloadable zip), WordPress/Blogger/AMP guides, API keys/backups
- **M7** Audit log (panel actions → settings viewer) + TOTP 2FA (staged code-gated sign-in, enable/disable on profile)

## Quick start (dev)

```sh
pnpm install
cp .env.example .env        # set DATABASE_PATH, AUTH_SECRET, APP_ENC_KEY, OWNER_EMAIL
pnpm --filter @pushpanel/db generate   # (optional) rebuild migration bundle
pnpm --filter @pushpanel/web build     # e2e uses the production build
pnpm --filter @pushpanel/web exec playwright test   # full e2e suite (40 tests)
```

First run: open `/setup` once to create the owner account (sign-up is disabled afterwards).

## Deployment

```sh
docker compose up -d --build   # web :3000 + worker share a SQLite volume
```

## Status — Personal / Private Single-Tenant (All Limits Removed)

**M0–M7 shipped + LumaPush / OneSignal / Aplu full parity + unlimited personal use.** No pricing, no plans, no caps: unlimited domains / subscribers / campaigns / manual IDs (1M) / variants (20) / tags (unlimited) / imports (100k) / fetch (10M). All AI (hook/spam/translate/url→campaign/automagic/smart-send/image/fatigue) offline-heuristic + LLM (`AI_API_KEY`). Every feature is unlocked — single-person private deployment, no business tier gating.

Verified 2026-08-21: `typecheck 5/5` `lint 0 errors` `test 139/139`. See `docs/lumapush-deep-research.md` + `docs/parity-matrix.md` (now 🟢 89/89 personal).