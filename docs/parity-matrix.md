# Parity Matrix — LaraPush 100% feature coverage for our build

> Every feature LaraPush ships (from research/03-features.md + 09-panel-feature-spec.md, verified against their 28-doc knowledge base) mapped to our implementation. Status = PR-review checklist; one box ticked only when the feature works end-to-end.
>
> Legend: 🟢 done · 🟡 planned this milestone · ⚪ backlog · ➕ our improvement over LaraPush

## A. Core model

| # | Feature (LaraPush) | Our module | M | Status |
|---|---|---|---|---|
| A1 | Unlimited domains/websites | Workspaces → Domains | M1 | 🟡 |
| A2 | Unlimited subscribers | subscribers table, no caps | M1 | 🟡 |
| A3 | Unlimited campaigns, lifetime | campaigns, no limits | M1 | 🟡 |
| A4 | Self-hosted tokens (privacy) | tokens on own DB (encrypted at rest) | M1 | 🟡 |
| A5 | No ads injected into subscriber notifications | n/a by design | M0 | 🟢 |
| A6 | License-gated panel (paid model) | optional license module, disabled by default | ⚪ | ⚪ |

## B. Campaigns & sending

| # | Feature | ours | Status |
|---|---|---|---|
| B1 | Campaign create (title/message/icon/image/launch URL) | campaigns editor | 🟡 |
| B2 | Fetch content from URL (og-scrape) | fetch-content service (SSRF-safe) | 🟡 |
| B3 | Audience: All / Manual / Segment | audience selector | 🟡 |
| B4 | Schedule now or date-time + timezone | schedule + tz picker | 🟡 |
| B5 | CTA buttons (text+logo+url, multiple) | buttons editor | 🟡 |
| B6 | Live preview (test push to your device) | preview + test-send | 🟡 |
| B7 | Send & Create Template / Send & Update Template | split-button | 🟡 |
| B8 | Quick Push (URL → campaign → send) | quick push page | 🟡 |
| B9 | Clone campaign | clone action | 🟡 |
| B10 | Clone domain config (multi-site ease) | domain clone | 🟡 |
| B11 | Instant delivery notice (real-time) | socket.io live feed ➕ | 🟡 |
| B12 | Campaign list + status + per-campaign stats | campaigns list/detail | 🟡 |

## C. Automation

| # | Feature | Status |
|---|---|---|
| C1 | AutoMagic Dynamic (WP API URL + range + random pick) | content adapter (RSS/WP/JSON) ➕ | 🟡 |
| C2 | AutoMagic Static (evergreen fixed campaign) | static automation | 🟡 |
| C3 | AutoMagic cron scheduling (crontab input + preset) | cron UI + crontab.guru link | 🟡 |
| C4 | Auto-pause if source API down | retry w/ backoff + alert | 🟡 |
| C5 | Push on Publish (WP plugin toggle + delay) | plugin + webhook + RSS triple ➕ | 🟡 |
| C6 | Welcome Push (auto on subscribe) | welcome automation | 🟡 |
| C7 | YouTube Push (channel → LP link → auto notify) | YT channel module | 🟡 |
| C8 | Drip notifications (sequence) | drip builder ➕ | ⚪ |
| C9 | Webhook → Push trigger | webhook automation ➕ | ⚪ |

## D. Audience & segmentation

| # | Feature | Status |
|---|---|---|
| D1 | Segment by URL (subscription page) | condition builder | 🟡 |
| D2 | Segment by Country / State | mmdb geo | 🟡 |
| D3 | Segment by Device | device field | 🟡 |
| D4 | Segment by OS / Browser | os/browser fields | 🟡 |
| D5 | Segment by subscribe date | date conditions | 🟡 |
| D6 | AND conditions (their: AND only) | AND/OR/NOT groups ➕ | 🟡 |
| D7 | Estimate segment size before save | live count estimate | 🟡 |
| D8 | Segments usable in any campaign audience | audience selector | 🟡 |
| D9 | Clean unsubscribed users (per domain, broom) | clean action + confirm | 🟡 |
| D10 | Daily unsubscribe cleanup (cron) | daily cleanup job | 🟡 |
| D11 | CSV export of subscribers | export CSV/JSONL | 🟡 |
| D12 | Import subscribers | import wizard | 🟡 |
| D13 | Import/export between panels (same domain) | round-trip JSONL | ⚪ |
| D14 | Migration from other services | free migration importer ➕ (theirs: paid add-on) | ⚪ |

## E. Analytics & reporting

| # | Feature | Status |
|---|---|---|
| E1 | Subscriber growth over time (basic) | growth chart | 🟡 |
| E2 | Advanced: date/location/device/browser filters | analytics filters | 🟡 |
| E3 | Click-through tracking | SW beacons delivered+clicked ➕ | 🟡 |
| E4 | Per-CTA button clicks | per-button breakdown | 🟡 |
| E5 | Server status in dashboard (load/memory) | server status page | 🟡 |
| E6 | Real-time campaign feed | WS + SSE ➕ | 🟡 |
| E7 | A/B title testing | ⚪ ➕ |
| E8 | Best-send-time heatmap | ⚪ ➕ |
| E9 | Analytics export (CSV) | ⚪ |

## F. Growth & collection

| # | Feature | Status |
|---|---|---|
| F1 | LP links (short subscription links) | LP Links module | 🟡 |
| F2 | LP link force-subscribe | force toggle | 🟡 |
| F3 | LP full-page script mode (self-host prompt) | script generator | 🟡 |
| F4 | LP deleted-target URL (404 or custom) | global setting | 🟡 |
| F5 | YouTube links (video description collection) | YT links | 🟡 |
| F6 | Apple/iOS PWA (new + existing modes) | iOS module | 🟡 |
| F7 | iOS auto-gen manifest + sw + icon zip | file generator | 🟡 |
| F8 | Prompt: 4 types (custom/backdrop/native/fullscreen) | prompt engine | 🟡 |
| F9 | Prompt advanced: bell + location + unsub | bell widget | 🟡 |
| F10 | Prompt location mobile (left/right/center) | positioning | 🟡 |
| F11 | Prompt delay + re-appear timing | delay/reappear | 🟡 |
| F12 | Blogger integration + confirm panel | Blogger guided flow | 🟡 |
| F13 | AMP support (validator-passed) | AMP frames | 🟡 |
| F14 | Web Stories (WP) | plugin Story hook | ⚪ |
| F15 | Auto code injection toggle (WP) | auto integration | 🟡 |

## G. Settings parity (every knob they have)

| # | Setting | Ours | Status |
|---|---|---|---|
| G1 | Default audience (All/Manual/Segment) | same | 🟡 |
| G2 | Sending speed control | sending speed slider | 🟡 |
| G3 | Worker count (advanced) | worker count | 🟡 |
| G4 | Auto Code Integration toggle | auto integration toggle | 🟡 |
| G5 | Use CDN for image URLs | CDN toggle | 🟡 |
| G6 | Use UTM on notification URLs | UTM toggle | 🟡 |
| G7 | Daily cleanup toggle | cleanup toggle | 🟡 |
| G8 | API access toggle | API toggle | 🟡 |
| G9 | Allow duplicates from API/WP | dedupe toggle | 🟡 |
| G10 | LP link deleted-target URL (404 or custom) | LP fallback setting | 🟡 |
| G11 | Host redirect (domain redirect handling) | host redirect config | ⚪ |
| G12 | Language (panel) | i18n + locale | ⚪ |
| G13 | Timezone | tz setting | 🟡 |
| G14 | ReadMore text customization | readMore setting | 🟡 |
| G15 | Profile: name edit, email read-only, pwd change, logout-all | same + 2FA ➕ | 🟡 |
| G16 | Update panel (version check + update) | update module | 🟡 |
| G17 | Backup manual + auto (daily/weekly/monthly) + Drive + 7d retention | backup module + S3/Drive | 🟡 |

## H. Integrations & API

| # | Feature | Status |
|---|---|---|
| H1 | WordPress plugin (1-click send, publish, delay, purview) | panel-zip plugin + scoped keys | 🟡 |
| H2 | Automatic WP code embedding | auto embed | 🟡 |
| H3 | Blogger snippet flow | Blogger | 🟡 |
| H4 | Manual code integration (head + files + verify) | integration flow | 🟡 |
| H5 | REST API for developers (unlimited calls) | API keys + rate limit | 🟡 |
| H6 | Segment sending via API | API send | 🟡 |
| H7 | Analytics via REST | API stats | ⚪ |

**Backlog totals:** the 57 rows above are the definition of "v1.0 complete". Each 🟡 turns 🟢 as we hit the milestone exit in BUILD-PLAN §20.