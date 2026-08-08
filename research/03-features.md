# 03 — Features (Complete Inventory — everything LaraPush has)

Source: marketing pages + full official docs (28 files) + WP plugin + API page. "Pro" = Pro plan only; "Premium" = Premium add-on; "(all)" = included in all plans.

## 1. Core model (all plans)
- **Unlimited domains / websites** — register unlimited domains, no caps.
- **Unlimited subscribers** — no token limits (load-tested 150M+ tokens).
- **Unlimited campaigns / sends** — forever, included.
- **Lifetime license** — one-time payment, perpetual (version-locked).
- **Self-hosted** — subscriber tokens stay on your server; privacy selling point.
- **No ads in notifications** — unlike monetized SaaS push services.

## 2. Campaigns & Sending
- **Campaign creation** (topbar "Create Campaign" / Campaigns tab) — fields: **Title, Message, Icon URL, Image URL, Launch URL**, audience, buttons, schedule, preview, send.
- **Fetch Content from URL** — input article URL → auto-fetch title + description (faster campaign creation).
- **Live Preview** — send a test notification to your own device (permission prompt) before mass sending.
- **Audience selection**: **All / Manually-select subscribers / Segment** (default: All).
- **Schedule** — setting now: toggle "Send Notification Now" → date-time picker + timezone dropdown (searchable tz list, e.g. Asia/Kolkata).
- **CTA Buttons** (Advanced settings) — per button: **text, logo URL, launch URL**; multiple buttons (Read More / Share / Subscribe / Download).
- **Send & Create Template / Send & Update Template** — split-button on Send: send then save/update as reusable template.
- **Quick Push** — paste article URL → "Create New Campaign" → Send (2-click flow).
- **Clone campaign** — duplicate existing campaign for reuse.
- **Clone project/domain + retargeting** — clone a domain's config to integrate a new domain quickly.
- **Instant delivery notice** — real-time acknowledgment of sends.

## 3. Automation (menu: Automation)
- **AutoMagic Push** (all plans? docs imply generic, promoted as flagship):
  - **Dynamic mode** — WP API URL + **article range picker number** → random recent post selection; cron schedule via crontab syntax (cron examples; crontab.guru link); **Validate WordPress API** button; auto-pause if API unavailable; Run-time name/audience; preview; save.
  - **Static mode** — fixed title, description, image URL, CTA etc. sent on schedule (evergreen autopilot).
  - Audience: All / Manually / Segment (default All).
- **Push on Publish (Pro)** — WP plugin toggle; auto-notify on any new post (incl. Web Stories); optional delay.
- **Welcome Push** — automatic greeting notification for brand-new subscribers (fetch content from URL or manual template; advanced settings).
- **YouTube Push** — site. Manage channels (per channel: LP link, desktop/mobile subscriber counts, status, actions) + auto-push on new video.
- **Drip / multiple.** (marketed as Drip notifications: scheduled sequence at intervals)

## 4. Audience Management
- **Segmentation** — 6 criteria: **URL (subscription page match), Country/State, Device, Browser, Number of times** (device/browser/date — see 09), Date subscribed. AND conditions (boolean AND), **estimated segment size preview plugin**, create/save/use in campaigns.
- **Import / Export subscribers** — per domain: export to file (backup/migration), import restauration; requires matching Firebase config + same domain name between panels.
- **Cleaning unsubscribed users** — per-domain broom action (yellow), confirm popup, removes dead tokens (faster delivery, lighter DB, accurate stats).
- **Unsubscribe handling** — automatic cleanup on unsubscribe (daily cron "Daily Unsubscribe Cleanup").
- **Migration add-on** — official paid add-on to transfer subscribers from OneSignal / TruePush / iZooto / other services (different payload structure → must use add-on, or Migration plan).

## 5. Analytics & Reporting
- **Advanced Analytics (Pro)**: by date range, location (country/state), device, browser; subscriber growth over time; real-time, click-through, delivery, per-domain reports.
- **Basic analytics (Startup)**: subscriber growth chart only.
- **Instant Delivery Notice** — real-time send confirmation.
- **Server Status** — real-time server stats (uptime, load, memory) in dashboard.

## 6. Growth / Subscriber Collection
- **LP Links** (Premium) — short subscription links you can share anywhere: your website, social bio, QR, email/SMS. Full-page script integration supported. Force Subscribe. Tracking per link (clicks + subscribers). Deleted-target fallback URL setting.
- **YouTube Links** (Premium) — collect subscribers from video descriptions / pinned comments via generated short links.
- **External-link collection** (Premium).
- **iOS PWA support** — auto-generated manifest.json, firebase-messaging-sw.js, icon512.zip; two modes: new PWA / existing PWA; customizable iOS install prompt + instructions, reappear timing; iOS 16.4+ Safari.
- **Blogger + AMP support** — Blogger snippet (banner config: heading, subheading, logo, Allow/Deny text, confirm checkbox), AMP-validated pages (Google Discover eligible).
- **Customizable Prompts** (all plans) — choice of 4 prompt types:
  1. **Custom prompt** (branded, DM-like UI with logo/heading/sub)
  2. **Custom prompt with Backdrop**
  3. **Default/Native prompt** (browser default)
  4. **Full-screen prompt**
  + **Advanced prompt settings**: Enable a stable **Bell** (bottom bell widget) + bell location + unsubscribe option; prompt location on mobile (left/right/center); enable/disable custom prompt independently on desktop/mobile; **prompt delay** (delay, seconds); **prompt re-appearance** timer (after Deny re-show interval); real-time preview before saving.
- **WordPress plugin** — one-click push from WP admin, auto send on publish, delayed push (v1.0.7+).

## 7. Developer / Data / APIs
- **REST API** (enable in Settings → API; public Postman collection exists — "LaraPush API", 8 items, created 2022):
  - Free, **unlimited API calls**.
  - Capabilities: send push to all / to subset (by user IDs or segments); list/get/delete campaign; domain/subscriber management; token handling; **Host URL** env var (your panel URL).
  - Authorization — panel provides API credentials (likely API token / license-based). Enable from System Settings ("Turn on API" for WP plugin & scripts).
- **Google Drive Backup** (Premium) — schedule auto backup, download + restore, comeys with license-key verification, auto-7-day retention of on-disk backups.

## 8. Dashboard / Panel Workflows
- Domain registry / multi-site.
- Project/domain **view**, **modify**, **clone**, **integration**, **re-sync**, **pause collection**, **clean unsubscribes**, **delete**, **import/export**, **unhide Firebase config (license-gated reveal)**.
- Quick Push, Campaigns (filter by status), Templates, Automation panel, Server status view, Settings (General / Advanced / API / back Automation), Profile, Update tab, Backup tab.
- **Auto-updates** — Settings → Update: installed version vs available version, one-click Update (license check), e.g. `premium-prod-5.1.18 → 5.1.19`.

## 9. Performance
- Marketed up to **1.5M notifications/minute** ("5x faster than SaaS providers").
- 150M+ tokens tested; 400M+ combined subscriber claim across customers.

## 10. Settings inventory (System Settings) — complete list
- **General (all-domain, global):** Default audience (All/Manually/Segment…), **Sending Speed**, Auto Code Integration (auto-inject snippet into WP), Host Redirect (base domain redirects), **Use CDN**, **Use UTM**, **Daily Unsubscribe Cleanup**, **API access toggle**, **LP Links deleted target URL** (404 or custom), Save button.
- **Advanced:** **Worker Count**, **Allow Duplicates from API/WordPress** toggle.
- **API:** enable toggle ("Turn on API"), shows Host URL requirements.
- **Language & Region:** Language (default English, other tabs per config), **Timezone** (default UTC, list with search), **ReadMore Text** ("...Read More" / "...Tap to Open" / "...Continue Reading" / custom) — localized link label limit customization.
- **Profile:** Name (editable), Email (read-only), change password fields (old/new/confirm, allowed chars A-Za-z0-9!@#$), "Update Account", "Logout From All Devices" (session kill).
- **Backup:** Create Backup (manual), history list (download/delete/send-to-Drive), Setup Auto Backup (Daily/Hourly/Weekly/Monthly), Google Drive toggles (email or Upload **Service Account JSON** file), License key + Verify button, Save Configuration. **On-disk backups auto-delete after 7 days** unless backup offloaded.
- **Update:** Installed version vs Available version, Update button.
- **Server Status:** uptime / server info page.

## 11. Two payment model quirk (for completeness)
- Software license — ToS: single-server, no refunds, no source.
- Paid main-master upgrades ($177-300 for major version bump; used v4→v5 promo).
- Migration add-on plus MIGRATION50 coupon (50% off) exists.

## 12. What's NOT in LaraPush (found-opportunities for our product)
- No A/B testing of notifications / titles; no multi-panel cluster; no push retargeting/drip beyond basic drip; no AMP "—"; no dedicated "delete domain" with detach-Google; UI: Bootstrap/jQuery-era admin; licensing per-info-server-only (no multi-server / no failover abuse); analytics are early basic vs OneSignal; no iOS-standalone app (only PWA); no zero-dependency own sender (depends on FCM).
→ see 10-gaps-and-opportunities.md