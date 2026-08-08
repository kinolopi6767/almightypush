# 13 - Product Roadmap (our build: "PushPanel")

> Strategy: ship the LaraPush feature set (research/09) faster and fix the top gaps (research/10). Four release phases, each ending in something shippable and demoable. Stack decisions live in research/12-our-architecture.md.

## Phase 0 - Foundation (weeks 1-4) - internal, no public release

**Goal:** prove the delivery core works and freeze the stack.

- Scaffold monorepo: panel API, React UI shell, sender worker, SDK service.
- Delivery spike A: VAPID web-push end-to-end (subscribe, store, send, click tracking) on Chrome/Edge/Firefox.
- Delivery spike B: FCM adapter end-to-end, including iOS PWA (Safari 16.4+).
- CI + Playwright smoke tests; benchmark script (tokens/min on a $6 droplet).
- Decision gate: final stack + PushProvider interface frozen (research/12 section 4).

## Phase 1 - MVP (weeks 5-12) - public beta

**User story:** a blogger installs the panel, adds a domain, collects subscribers, sends and schedules campaigns.

- Domains CRUD (clone, pause, delete) + VAPID creds; Firebase config paste path for FCM.
- SDK: 4 prompt types + advanced options (bell, location, delay, re-appearance), service worker, manifest, AMP frames; Verify flow.
- Campaigns: create (fetch-content-from-URL), live preview, schedule + timezone, CTA buttons, templates (send & save / send & update), quick push, clone campaign.
- Subscribers: list, export/import (own documented format), manual clean + daily cleanup.
- Basic analytics: per-domain counts, growth chart, per-campaign sent/clicked, per-button clicks.
- Settings: general (sending speed, UTM, CDN toggle, API toggle, LP-link 404 target), advanced (worker count, allow duplicates), profile (password, logout-all), timezone/readMore text, panel update (signed), backup (manual + auto + S3/Drive).
- Server status page.
- REST API v1 core + scoped API keys.
- **Exit:** 10 beta users sending daily; test suite green.

## Phase 2 - Automation & Audience (weeks 13-20) - v1.0 launch

- Segment engine: 6+ fields, AND/OR/NOT groups, estimate preview, dynamic re-eval at send time.
- Automations: Welcome Push; Push-on-Publish (WP plugin first, then RSS/JSON adapter to cover Blogger + static sites - beats their WP-only); AutoMagic equivalent (dynamic pick + static, cron UI with presets); YouTube channel poll + push; scheduled campaigns (already in P1).
- LP links (/sl/): force-subscribe, full-page script mode, click/subscriber tracking, deleted-target config.
- WordPress plugin (their UX, but scoped API keys): send from WP, push-on-publish + delay, who-can-send, iOS PWA config.
- Analytics v2: date/location/device/browser filters, live delivery feed over WebSocket.
- **v1.0 launch:** self-host (Docker + one-line installer) + free SaaS tier + pricing (see GTM below).

## Phase 3 - Depth & Trust (weeks 21-30) - v1.5

- Provider portability: one-click token export/import across providers; migration importer for OneSignal/TruePush/iZooto tokens (free, unlike their paid add-on).
- Analytics pro: A/B title tests, unsub-funnel, best-send-time heatmaps, CSV/API export.
- iOS PWA polish: both modes (new/existing), per-device prompt telemetry.
- Team roles + audit log (owner/admin/sender).
- i18n (panel UI in EN + 4 languages), polished dark mode.
- Multi-node: horizontally scalable workers (Redis-backed), multi-server panel mode - removes their single-server license limit.

## Phase 4 - Platform (weeks 31-44) - v2.0

- Webhooks in/out + Zapier/Make app; visual automation builder.
- Multichannel delivery: APNs (Safari), direct provider endpoints - real independence from FCM.
- SaaS multi-tenant console (shared infra, per-customer panel); billing (subscription + LTD hybrid).
- Data warehouse export for power users.
- Public sandbox demo (no signup), API playground, docs in-repo.

## GTM & pricing notes (tie to research/08 and /10)

- Self-host LTD: undercut anchor ($399 Startup-equivalent, $649 Pro-equivalent), 30-day refund, source-access tier.
- SaaS: $0 free tier (1 domain / 5k subs) then $19-49/mo; hybrid: LTD buyers get free SaaS credits.
- Affiliate program 20-30% + comparison-page SEO (proven by them); VPS-partner one-click installs (DigitalOcean Marketplace, Vultr).
- Market differentiators: no-Firebase-required VAPID path, token portability, honest throughput telemetry, open docs, team roles.
- Launch cadence: LTD sales + affiliate network from v1.0; SaaS billing from Phase 2.

## Milestone checklist (track in repo)

- [ ] Phase 0 decision gate passed (stack + PushProvider interface frozen)
- [ ] Phase 1 exit: 10 daily-active beta panels, CI green
- [ ] Phase 2 exit: v1.0 launch (self-host + SaaS free tier), 100 installs
- [ ] Phase 3 exit: v1.5 (portability + analytics pro), 1,000 installs
- [ ] Phase 4 exit: v2.0 (webhooks, multichannel, SaaS console), 5,000 installs
