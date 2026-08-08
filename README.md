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

- Next.js (App Router, Node runtime, `output: standalone`) · TypeScript strict
- better-sqlite3 (WAL) + Drizzle ORM
- web-push (VAPID) default; FCM adapter optional
- Auth.js (credentials), zod, pino, Tailwind + shadcn/ui

## Quick start (dev)

```sh
pnpm install
cp .env.example .env        # set DATABASE_PATH, AUTH_SECRET, APP_ENC_KEY, OWNER_EMAIL
pnpm db:migrate             # apply schema
pnpm dev:web                # panel at :3000
pnpm dev:worker             # background worker (idle until M1)
```

First run: open `/setup` once to create the owner account (sign-up is disabled afterwards).

## Deployment

```sh
docker compose up -d --build   # web :3000 + worker share a SQLite volume
```

## Status

`M0` — foundation (in progress). See BUILD-PLAN.md §22 for the release checklist.