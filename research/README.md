# LaraPush.com — Deep Research

**Research date:** 08 Aug 2026 (round 2 — feature-complete revision)
**Subject:** https://larapush.com — Self-Hosted Push Notification Panel
**Purpose:** Feature & behavior blueprint so we can build a **better version** of LaraPush with our own tech. Vendor-internal tech choices (Laravel/jQuery etc.) are NOT treated as a spec — we only copy *product behavior, features, workflows and delivery architecture*, not their stack.

**Method (round 2):** live site crawl (25+ pages), full official docs source (28 markdown files cloned from GitHub `TheLarapush/LaraPush-Docs-Source`), WordPress.org plugin page, status page, Postman API collection, Trustpilot, web search.

**Source material:** the complete official docs are cloned at `/tmp/opencode/larapush-docs/docs` (28 files: intro, getting-started, all features, automation, system-settings, integrations, firebase kbase).

---

## Documents in this research

| File | Content |
|---|---|
| [01-overview-and-company.md](01-overview-and-company.md) | What LaraPush is, company, story, mission, pages map |
| [02-product-architecture-and-delivery.md](02-product-architecture-and-delivery.md) | **Delivery architecture that matters for our build**: FCM model, per-domain Firebase projects, data model, performance knobs, data flow (NOT their vendor stack) |
| [03-features.md](03-features.md) | **Complete feature inventory** — everything LaraPush has across all plans |
| [04-pricing-and-plans.md](04-pricing-and-plans.md) | Startup/Pro/Premium pricing, EMIs, upgrades, migration, licensing |
| [05-installation-and-hosting.md](05-installation-and-hosting.md) | Install flow, server requirements, checkout quirks |
| [06-integrations.md](06-integrations.md) | WordPress plugin, Blogger, AMP, iOS PWA, 4 prompt types, REST API (+API collection), YouTube |
| [07-reviews-and-competitors.md](07-reviews-and-competitors.md) | Trustpilot/WP reviews, competitors, doc evidence |
| [08-business-ecosystem.md](08-business-ecosystem.md) | Affiliate program, ZeroCLI, support, status page, developer API ecosystem |
| [09-panel-feature-spec.md](09-panel-feature-spec.md) | **Module-by-module panel spec**: every menu, screen, field, workflow, setting (for our build) |
| [10-gaps-and-opportunities.md](10-gaps-and-opportunities.md) | **Where LaraPush is weak + opportunities to make our product better** |
| [11-api-endpoints.md](11-api-endpoints.md) | **Confirmed API endpoints** extracted from the WordPress plugin source (exact payloads + responses) |
| [12-our-architecture.md](12-our-architecture.md) | **Our build spec**: stack, modules, provider-abstraction, data model, API v1 contract |
| [13-product-roadmap.md](13-product-roadmap.md) | **Phased roadmap** P0→P4 with exit criteria + GTM/pricing |

---

## TL;DR

- **Product:** self-hosted, lifetime-licensed **web push notification panel**; unlimited domains/subscribers/campaigns; subscriber tokens stored on customer's own server; delivery via **Google FCM** (customer brings own Firebase project).
- **Pricing:** $499 Startup, $799 Pro, $399 Premium add-on, migration add-on; paid major-version upgrades; EMI via Razorpay.
- **Selling points:** pay-once vs SaaS, unlimited everything, 1.5M notif/min claim, no ads in notifications, data on own server.
- **Company:** Brandzzy SoftTech Pvt Ltd, Bhubaneswar, India; founder Anirudh Saraya; started Jan 2021; Trustpilot 4.4/5 (87 reviews); revenue via affiliates, upgrades, ZeroCLI managed hosting.
- **For our build:** comprehensive feature spec in 09; weakness list in 10.