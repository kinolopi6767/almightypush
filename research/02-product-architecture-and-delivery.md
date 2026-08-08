# 02 — Product Architecture & Delivery Model (what matters for OUR build)

> Note: the old "tech stack forensics" (Laravel/jQuery/Bootstrap vendor details) is intentionally dropped — we are NOT copying their implementation. This file documents the **delivery architecture, data model and scaling behavior** that define how LaraPush *works*, because those are the requirements our product must meet or beat.

## 1. The Core Delivery Model (the whole product in one paragraph)

1. Customer buys a panel license, installs the panel on their **own server** (Ubuntu 24.04 VPS).
2. Customer creates their own **Google Firebase project** (free) and enters the Firebase config per website/domain into the panel.
3. Panel generates a **site integration snippet** (JS + service worker + manifest) — one per domain. Visitor's browser subscribes via FCM; the **subscriber token is stored in the customer's panel database** (self-hosted = data never leaves their server).
4. When a campaign is sent, the panel looks up recipient tokens and sends messages via the **FCM (v1) HTTP API** using that domain's Firebase service-account credentials.
5. FCM delivers to Chrome/Edge/Firefox/Safari (iOS 16.4+ via PWA). Clicks open the launch URL; open/click events are tracked (where possible) and stored in panel DB for analytics.

**Implication for our build:** the "product" is really 3 pieces — (a) a **panel** web app that manages domains/subscribers/campaigns, (b) a **client-side SDK** per registered domain that prompts + collects tokens into a service worker, and (c) a **sender engine** that fans out messages through FCM. Everything LaraPush sells beyond that is UI + automation on top of these three.

## 2. Firebase Project Model (from official Firebase Architecture doc)

- **One Firebase project can span multiple domains** — the panel prompts users to choose on first registration ("New Firebase Project" vs "Paste existing config").
- Firebase config includes: `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`, `measurementId` (+ management/service-account credentials).
- Official scaling guidance (v5 docs):
  - High-traffic domain (expect 5M+ subscribers) → **dedicated Firebase project per domain**.
  - Several small domains (combined < 5M) → **share one project**.
  - 100+ small domains → split projects once combined subscribers approach 5M.
- **Domain + Firebase project = what subscribers are tied to.** Changing a domain's Firebase project orphans all of its subscribers (they can't receive messages anymore).
- Credential rotation: if service-account creds are revoked, regenerate from Firebase Console and update in panel — subscribers survive as long as the project isn't deleted.
- If a Firebase project is **deleted** → all subscribers collected under it are **permanently lost** (Google recovery window dependent). This is the single biggest data-loss risk in the whole product model. **Our build should remove/minimize this dependency or add portability** (see 10-gaps).

## 3. Data Model (panel-side, reconstructed from docs + API references)

| Entity | Fields / behavior (observed) |
|---|---|
| **Domain (Website)** | name/URL; Firebase config block; subscriber count; collection status (active/paused); actions: view/modify, integration, import/export, clone, clean unsubscribed, re-sync, delete |
| **Subscriber** | browser token; device (mobile/desktop); OS; browser; country/state (geo at subscription); subscription URL; subscription date; unsubscribed flag/date |
| **Campaign** | launch URL, title, message, icon URL, image URL, audience (all/manual/segment), schedule date-time + timezone, CTA buttons, template linkage, live preview flag, status (draft/scheduled/sent) |
| **Template** | title, message, icon URL, image URL, launch URL (saved for reuse) |
| **Segment** | name, domain(s) selector, conditions (URL contains / Country/State / Device / OS / Browser / Date), estimated size |
| **LP Link** | short code, target URL, prompt text, force-subscribe, click/subscriber stats, delete-target behavior (404 or custom) |
| **YouTube Channel** | channel URL, prompt text, force subscribe, LP link generated, desktop/mobile subscriber counts, active toggle |
| **Backup** | DB dumps; 7-day retention; manual/auto (daily|weekly|monthly); Google Drive export (service-account JSON) |
| **Profile/Account** | name (editable), email (read-only), password, sessions (global logout) |
| **Settings** | see §06 — full knob list |

## 4. Sending Performance (claims + evidence)

- Claimed up to **1.5M notifications/minute** (marketing); "5x faster than other push services".
- Real-world: throughput bound by **FCM API response time** + server concurrency.
- Panel exposes a **Sending Speed** control (settings slider) — user-adjustable; official tip: *decrease if panel crashes under high load*.
- **Worker Count** (Advanced settings): number of background workers for processing; increase for speed, decrease if CPU/memory-limited.

## 5. Delivery-Affecting Options (settings that impact sending)

- **Use CDN toggle** — notification image URLs should point to CDN; without it the browser/panel makes extra requests to the customer server during sending, slowing it down.
- **Use UTM toggle** — auto-append UTM params to notification URLs (utm_source etc.) for analytics attribution.
- **Daily Unsubscribe Cleanup** — cron that deletes unsubscribed devices from DB daily; plus **manual clean** per domain ("Clean Unsubscribed Users" button) — improves send speed, storage, analytics accuracy.
- **Allow Duplicates from API/WordPress** (Advanced, default off) — permits duplicate token records when auto-posting sources push content.

## 6. Automation Engine (cron-driven)

- **AutoMagic Push** — WordPress API integration: picks a **random recent post** from customer's WP JSON API; cron-schedulable (hourly/daily/custom crontab input, examples provided; crontab.guru referenced). Dynamic (post-based) or Static (fixed title/desc/image). Audience: All / Manually / Segment. Auto-pauses if WP API down.
- **Push on Publish** — WP plugin checkbox → auto push when a new post/story published (Pro only).
- **Welcome Push** — on new subscription event, auto-send welcome notification (content fetched from URL or manual; advanced settings).
- **YouTube Push** — send campaign when a new YouTube video published / brief-polled; channel list + status; per-channel active toggle.
- **Scheduled campaigns** — pick "Send Notification Now: No" → pick date/time + timezone → cron fires.

## 7. Panel delivery/infra stack of *theirs* (record only — NOT our spec)

For completeness, from HTTP forensics: Laravel+PHP panel, MySQL, Bootstrap 4/jQuery admin UI, cdn.larapush.com for the install script and sw.js, Cloudflare edge on marketing site, Razorpay/Zoho for sales. **None of this constrains our build.**