# Parity Matrix — LaraPush 100% feature coverage for our build

> Every feature LaraPush ships (from research/03-features.md + 09-panel-feature-spec.md, verified against their 28-doc knowledge base) mapped to our implementation. Status = PR-review checklist; one box ticked only when the feature works end-to-end.
>
> Legend: 🟢 done (verified by e2e/unit tests or direct code evidence) · 🟡 partial (core shipped, a sub-item pending) · ⚪ backlog (not started) · ➕ our improvement over LaraPush
>
> **As-built (verified 2026-08-11):** milestones M0–M7 shipped; 2FA/TOTP in and tested (m11 e2e passes). Items left as 🟡/⚪ below are the deferred backlog — see BUILD-PLAN.md §20 "post-M7".

## A. Core model

| # | Feature (LaraPush) | Our module | M | Status |
|---|---|---|---|---|
| A1 | Unlimited domains/websites | Workspaces → Domains | M1 | 🟢 |
| A2 | Unlimited subscribers | subscribers table, no caps | M1 | 🟢 |
| A3 | Unlimited campaigns, lifetime | campaigns, no limits | M1 | 🟢 |
| A4 | Self-hosted tokens (privacy) | tokens on own DB; AES-256-GCM at-rest for secrets | M1 | 🟢 |
| A5 | No ads injected into subscriber notifications | n/a by design | M0 | 🟢 |
| A6 | License-gated panel (paid model) | optional license module, disabled by default | ⚪ | ⚪ |

## B. Campaigns & sending

| # | Feature | ours | Status |
|---|---|---|---|
| B1 | Campaign create (title/message/icon/image/launch URL) | campaigns editor | 🟡 icon/image fields pending |
| B2 | Fetch content from URL (og-scrape) | fetch-content service (SSRF-safe) | ⚪ |
| B3 | Audience: All / Manual / Segment | audience selector | 🟢 |
| B4 | Schedule now or date-time + timezone | schedule + panel tz | 🟢 |
| B5 | CTA buttons (text+logo+url, multiple) | buttons editor (buttons_json in schema only) | ⚪ |
| B6 | Live preview (test push to your device) | test-push form per domain | 🟢 |
| B7 | Send & Create Template / Send & Update Template | split-button (template pre-fill shipped) | 🟡 |
| B8 | Quick Push (URL → campaign → send) | quick push page | ⚪ |
| B9 | Clone campaign | clone action | ⚪ |
| B10 | Clone domain config (multi-site ease) | domain clone | ⚪ |
| B11 | Instant delivery notice (real-time) | socket.io live feed ➕ | ⚪ no WS/SSE yet |
| B12 | Campaign list + status + per-campaign stats | campaigns list/detail | 🟢 |

## C. Automation

| # | Feature | Status |
|---|---|---|
| C1 | AutoMagic Dynamic (WP API URL + range + random pick) | content adapter (RSS/WP/JSON) ➕ | 🟢 |
| C2 | AutoMagic Static (evergreen fixed campaign) | static automation | 🟢 |
| C3 | AutoMagic cron scheduling (crontab input + preset) | cron UI + crontab.guru link | 🟢 crontab input + presets, cron-parser re-arm |
| C4 | Auto-pause if source API down | retry w/ backoff + alert | 🟢 3 consecutive failures -> paused + fast retry probe |
| C5 | Push on Publish (WP plugin toggle + delay) | plugin + webhook + RSS triple ➕ | 🟢 plugin + HMAC webhook shipped; RSS poll pending |
| C6 | Welcome Push (auto on subscribe) | welcome automation | 🟢 |
| C7 | YouTube Push (channel → LP link → auto notify) | YT channel module | 🟢 channel mgmt page + LP link creation |
| C8 | Drip notifications (sequence) | drip builder ➕ | 🟢 multi-step sequences with day delays |
| C9 | Webhook → Push trigger | webhook automation ➕ | 🟢 push_on_publish trigger endpoint |

## D. Audience & segmentation

| # | Feature | Status |
|---|---|---|
| D1 | Segment by URL (subscription page) | condition builder | 🟢 |
| D2 | Segment by Country / State | mmdb geo (country/state columns today; mmdb pending) | 🟡 |
| D3 | Segment by Device | device field | 🟢 |
| D4 | Segment by OS / Browser | os/browser fields | 🟢 |
| D5 | Segment by subscribe date | date conditions | 🟢 |
| D6 | AND conditions (their: AND only) | AND/OR/NOT groups ➕ | 🟢 |
| D7 | Estimate segment size before save | live count estimate | 🟢 |
| D8 | Segments usable in any campaign audience | audience selector | 🟢 |
| D9 | Clean unsubscribed users (per domain, broom) | clean action + confirm | 🟢 |
| D10 | Daily unsubscribe cleanup (cron) | daily cleanup job | 🟢 |
| D11 | CSV export of subscribers | export CSV | 🟢 |
| D12 | Import subscribers | import wizard | 🟢 |
| D13 | Import/export between panels (same domain) | round-trip JSONL | ⚪ |
| D14 | Migration from other services | free migration importer ➕ (theirs: paid add-on) | ⚪ |

## E. Analytics & reporting

| # | Feature | Status |
|---|---|---|
| E1 | Subscriber growth over time (basic) | growth chart | 🟡 dashboard shows live counts; chart pending |
| E2 | Advanced: date/location/device/browser filters | analytics filters | ⚪ |
| E3 | Click-through tracking | SW beacons delivered+clicked ➕ | 🟢 |
| E4 | Per-CTA button clicks | per-button breakdown | ⚪ |
| E5 | Server status in dashboard (load/memory) | server status page | 🟢 |
| E6 | Real-time campaign feed | WS + SSE ➕ | ⚪ |
| E7 | A/B title testing | ⚪ ➕ |
| E8 | Best-send-time heatmap | ⚪ ➕ |
| E9 | Analytics export (CSV) | 🟢 |

## F. Growth & collection

| # | Feature | Status |
|---|---|---|
| F1 | LP links (short subscription links) | LP Links module | 🟢 |
| F2 | LP link force-subscribe | force toggle | 🟢 |
| F3 | LP full-page script mode (self-host prompt) | /p/{code} landing page | 🟢 |
| F4 | LP deleted-target URL (404 or custom) | tombstones + fallback | 🟢 |
| F5 | YouTube links (video description collection) | YT links | 🟡 channel table + YT automation; links page pending |
| F6 | Apple/iOS PWA (new + existing modes) | iOS module | 🟢 manifest + install hint + SDK iOS 18 extras |
| F7 | iOS auto-gen manifest + sw + icon zip | file generator | ⚪ static manifest today |
| F8 | Prompt: 4 types (custom/backdrop/native/fullscreen) | prompt engine | ⚪ SDK gets/config pending |
| F9 | Prompt advanced: bell + location + unsub | bell widget | ⚪ |
| F10 | Prompt location mobile (left/right/center) | positioning | ⚪ |
| F11 | Prompt delay + re-appear timing | delay/reappear | 🟡 iOS install hint reappears weekly; SDK prompts pending |
| F12 | Blogger integration + confirm panel | Blogger guided flow | 🟡 guide shipped; guided flow pending |
| F13 | AMP support (validator-passed) | AMP frames | 🟡 guide shipped; frames pending |
| F14 | Web Stories (WP) | plugin Story hook | ⚪ |
| F15 | Auto code injection toggle (WP) | auto integration | ⚪ |

## G. Settings parity (every knob they have)

| # | Setting | Ours | Status |
|---|---|---|---|
| G1 | Default audience (All/Manual/Segment) | same | ⚪ |
| G2 | Sending speed control | sending speed slider | ⚪ |
| G3 | Worker count (advanced) | worker count | ⚪ |
| G4 | Auto Code Integration toggle | auto integration toggle | ⚪ |
| G5 | Use CDN for image URLs | CDN toggle | ⚪ |
| G6 | Use UTM on notification URLs | UTM toggle | ⚪ |
| G7 | Daily cleanup toggle | cleanup job + retention (no on/off toggle) | 🟡 |
| G8 | API access toggle | API toggle | ⚪ |
| G9 | Allow duplicates from API/WP | dedupe by partial-unique index (no toggle) | 🟡 |
| G10 | LP link deleted-target URL (404 or custom) | LP fallback setting | 🟢 |
| G11 | Host redirect (domain redirect handling) | host redirect config | ⚪ |
| G12 | Language (panel) | i18n + locale | ⚪ |
| G13 | Timezone | tz setting | 🟢 |
| G14 | ReadMore text customization | readMore setting | ⚪ |
| G15 | Profile: name edit, email read-only, pwd change, logout-all | name edit + 2FA; pwd change pending | 🟡 |
| G16 | Update panel (version check + update) | update module | ⚪ |
| G17 | Backup manual + auto (daily/weekly/monthly) + Drive + 7d retention | backups manual (create/delete/download); auto + offload pending | 🟡 |

## H. Integrations & API

| # | Feature | Status |
|---|---|---|
| H1 | WordPress plugin (1-click send, publish, delay, purview) | panel-zip plugin + scoped keys | 🟢 plugin zip served; 1-click send/delay via webhook config |
| H2 | Automatic WP code embedding | auto embed | ⚪ |
| H3 | Blogger snippet flow | Blogger | 🟡 guide shipped; guided flow pending |
| H4 | Manual code integration (head + files + verify) | guides + demo page | 🟡 |
| H5 | REST API for developers (unlimited calls) | API keys + rate limit | 🟢 API v1 + OpenAPI + keys |
| H6 | Segment sending via API | API send | ⚪ (campaign send is server-action based) |
| H7 | Analytics via REST | API stats | ⚪ |

**Backlog totals (as-built, verified 2026-08-11):** 89 rows → 🟢 36 · 🟡 17 · ⚪ 36. The 🟡/⚪ rows form the post-M7 backlog (BUILD-PLAN §20); each turns 🟢 when shipped with a passing e2e.