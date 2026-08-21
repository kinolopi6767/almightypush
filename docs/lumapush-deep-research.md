# LumaPush Deep Research — Full Feature Inventory (2026-08-21)

> Source: live fetch `lumapush.com/` , `/features` , `/pricing` , `/web-push-notifications` , `/email-marketing` , `/support` , `/blog/*` , plus OneSignal/FCM/Pushwoosh/Braze comparison via WebSearch. All URLs verified 2026-08-21.

## 1. Positioning
- **Self-hosted Customer Engagement Platform** — unified Web Push + Email + Automation + AI. Install on VPS (DO/Coolify). 1 line JS `<script>` before `</head>` + `sw.js` in root for HTTPS. Data sovereignty: tokens on YOUR server.
- **Scale:** `1k (Free) → 20k → 100k → Unlimited` push subscribers, `1k → 25k → 100k → 500k+` emails/mo (500 → 100k contacts), `2k/sec → 10k → 50k → 100k+/sec` dedicated throughput, 99.98% push / 99.2% email inbox.
- **Why switch from OneSignal/Mailchimp:** flat tiers vs per-subscriber tax (legacy $550-900/mo → LumaPush $29-79/mo, save 70-85% at 100k push + 25k email). ROI guide `/blog/why-switch...`.

## 2. Web Push Engine (detailed)
- **Protocols:** VAPID RFC8292 JWT (`aud`=push origin, `exp` ≤24h, `sub`=mailto/https) + `aes128gcm` RFC8291 ≤4KB, TTL 0–86400, urgency `very-low..high`, `topic` 64ch collapse, HTTP/2 to FCM/APNs/Mozilla. `userVisibleOnly:true` required. `pushsubscriptionchange` handled.
- **Platforms:** Chrome/Edge/Firefox/Brave (desktop+Android), Safari macOS Ventura+, iOS 16.4+ **PWA required** (standalone), HTTP→HTTPS subdomain fallback for HTTP sites. Detected via `matchMedia(display-mode:standalone)` / `navigator.standalone`.
- **Prompts:** 4 styles — native, custom-card, custom-card+backdrop, full-screen + bell widget (persistent). Config: logo/title/subtitle/button colors, Allow/Deny labels, `reappearTimeSec` (Deny 7h), `delaySec`, `hide-deny`, desktopOn/mobileOn, position left/center/right, slide-ups, trigger rules (scroll depth %, session duration 45s, page views threshold, IntersectionObserver).
- **Payload:** title 60-80ch, body 150ch, icon, badge, high-res image, 1-3 CTA buttons `{label, url, icon}`, deep link with `ref=lp&sub=1`, `data:{cid, deliveryId}`, silent push option.

## 3. Email Marketing Suite (LumaPush 2.0)
- **Builder:** drag-drop blocks (hero/banner, text, CTA button, product card, divider, social), responsive Gmail/Apple/Outlook, custom HTML/code injection (Pro+), reusable brand layouts, merge tags `{{first_name}}`, `{{custom:*}}`, conditional blocks per tier.
- **Deliverability:** custom sending domains (1→3→unlimited) with DNS `SPF/DKIM/DMARC` verification status `Verified/Authenticated/Aligned`, shared domain on Free. Reputation tracking, bounce/suppression auto-handle.
- **Lists:** CSV import with column mapping + dedup (5k Starter → unlimited + export API), tags 1→3→25→unlimited, activity filter `VIP / Newsletter`, `opened 30d / clicked`, geo.
- **Automation:** drips `1-step Free → 3-step → multi-branch funnels → unlimited autopilot`, RSS-to-email digest, webhook/API transactional, wait 2 days, goal `first purchase 48%`.
- **Analytics:** opens/clicks/bounces/unsubs real-time, A/B subject 3→unlimited, scheduling local timezone, throughput standard → dedicated.

## 4. Automation & Journeys
- **Triggers:** `opt-in` subscribe, `RSS publish` (WP/Ghost/Blogger/Shopify RSS), `event` (cart, product view), `API trigger`, `inactivity` win-back.
- **Actions:** `push` or `email` send, `delay`, `filter segment`, `branch` (A/B), `webhook`.
- **Presets:** AutoMagic RSS → AI copy + push (random from `range=10` or round-robin static), Welcome (multi-day onboarding), Drip (welcome + re-engagement), YouTube auto-push (channel URL → autodiscover feed → per-channel stats desktop/mobile), Cart recovery.
- **Execution:** queue `next_run_at` (cron 5-field or interval 15min default), worker tick 60s, `consecutive_failures` 3 → auto-pause, `MAX_RETRY 3` backoff 30s*2^n, `claimed_at` 10min stale reclaim.

## 5. Segmentation & Personalization (Smart Segmentation)
- **Attributes:** country/state/city (city on Business), device (mobile/tablet/desktop), OS+version, browser+specs, screen sizes, locale (`navigator.language`), timezone IANA, `subscribe_url`, `subscribed_at`, `last_active`, `page/section`, `plan tier`, `consentAt`.
- **Behavioral:** `opened_campaign=clicked`, `campaign_total_opens` (gte/gt/lt), click history, interest tags auto from `clicked` (`technology, news, deals`), recency/frequency/RFM 90d window.
- **Rules:** `AND/OR` groups, ops `equals/contains/starts/ends/in/gt/gte/lt/lte`, whitelist SQL, live estimate `COUNT(*)` (fixed from `rows.length` OOM). Export CSV/JSON.
- **Personalization:** merge per-subscriber vars before `aes128gcm` (keep ≤4KB, fetch heavy media after click via `data.url`), `tag` collapse, frequency cap `dailyCap 3` (transactional bypass), window `[9,21)` local hour via `Intl.DateTimeFormat` + IANA.

## 6. Analytics & Telemetry
- **Push:** `requested→delivered 99.4% → clicked 8-14.9% 4.8× email`, per-button clicks, deep-link analytics, real-time click trajectory 7-day exponential, retention 7d→30d→1yr→unlimited, series growth vs activity 29d, heatmap peak hours/days.
- **Email:** opens 42.8% (+14%), clicks, CTR, bounces.
- **Live:** SSE `/api/live` 1.5s poll `delivered/clicked/subscribed/unsubscribed` stream `id:>` with `retry:2500`.
- **Demographic:** country/browser/OS/device distribution pie.

## 7. AI Studio (8 tools, pricing)
- **AI Command Studio** (`500 gen/mo Pro → unlimited Business`): NL→campaign; OneSignal equivalent: `AI message composer` + `MCP server` (Claude/ChatGPT/Cursor) `ask anything` → query analytics, build segments/journeys, compose.
- **AI Smart Send:** per-user optimal hour (night-owl vs early-riser) via historical `open` patterns. OneSignal `Intelligent Delivery 39% lift`, `last-active` vs `timezone` 10am local. Our: `last_active` histogram per hour.
- **AI Hook & Headline Generator:** `3 angles Pro → unlimited`, frameworks curiosity/contrast/proof/pain/outcome; OneSignal AB 2→10 variants 16% lift, Vapronix 26% conversion, BetterMe 22% retention.
- **Spam Score Checker:** pre-blast vs browser spam filters.
- **URL→Campaign:** fetch OG `title/desc/image` → draft push/email.
- **Fatigue & Churn Shield** (Business): `frequency_cap` + throttling + churn prediction, `message throttling` + `Too much of a good thing?` + `push & SMS retargeting`.
- **Multilingual** (Business 6+ langs): 1-click translate `headings/contents`.
- **AutoMagic AI Generator:** RSS/WP → AI copy + image suggestion, `AutoMagic Notification Generator` priority zero-delay.
- **Supplementary (top services):** AI image generation (PushPilot/Braze), OneSignal `AI compose tone`, `MCP skills` (`segments`, `mobile-sdk-setup`, `iam-html-composer`, `journeys`).

## 8. Integrations & Dev
- **CMS:** WordPress 1-click `pushpanel.php` `publish_post → wp_remote_post` HMAC `sha256(ts.body)` + timestamp 5min, `save_post` delay, Web Stories, WooCommerce; Ghost native; Blogger snippet + `sw.js` root; Zapier/n8n 1k+; REST+HMAC webhook idempotency.
- **API:** `X-Api-Key` scoped `workspace + domain`, `60/min → 300/min → unlimited`, `POST /api/v1/subscribe` (endpoint+keys+device+subscribeUrl), `POST /api/v1/send` (`domain id|name`, `title/B`, `url/icon/image/buttons[3]`, `audience all/manual ids[10k]/segment`, `schedule ISO`), `GET /api/v1/stats` (`domain/from/to 29d`), `GET /api/v1/info?domain` (VAPID public), `GET /api/v1/click/{deliveryId}?btn` 302 + `clicked` event (dedupe `idx_events_clicked_delivery`), `POST /api/v1/automations/{id}/trigger` + `POST /api/v1/lp/subscribed` + `GET /api/fetch-content` SSRF-safe (`assertPublicHttpUrl` + DNS private check, 3 redirects, 2MB cap, 8s timeout), `GET /api/v1/openapi.json` + provider.
- **SDK:** `PushPanel.init({domain, publicKey, baseUrl, serviceWorkerPath, prompt:{type: auto/firstVisit/bell/none, position, delayMs, texts}})` → `subscribe()/unsubscribe()/state()`; `12KB` UMD, `canSubscribe()` iOS PWA hint, bell CSS, `all:initial` isolate.
- **Infra:** `better-sqlite3` WAL `busy_timeout 5000`, `synchronous NORMAL`, `cache_size -64000`, single-writer `BEGIN IMMEDIATE` migrations `__pushpanel_migrations`, `VACUUM INTO` backups (`manual/auto`, retention 10, `last_backup_at` 24h/weekly/monthly), shared volume `web+worker`, `APP_URL/https`, `APP_ENC_KEY 64hex` `aes256gcm v1:iv:tag:ct`, `AUTH_SECRET`, `trustHost:true`, CSP `worker-src 'self'`.

## 9. Pricing Comparison (benchmark 2026)
- LumaPush: `Free $0/1k` | Starter `$16` (20k push, 25k email, 2 domains) | Pro `$79` (100k push, 100k email, 10 domains, AI 500) | Business `$199` (unlimited, 500k email, unlimited AI/domains, white-label, team RBAC, dedicated queue).
- OneSignal: Free `unlimited mobile + 10k web / 10k email / 1 journey` | Growth `$19 + $0.012/MAU + $0.004/web sub + $1.5/k email` | Professional custom (volume discount) | Enterprise SLA 99.9%.
- FCM: free unlimited (topics) but no segmentation/AB/journeys; Pushwoosh `Free 1k MAU → $13/1k`; WonderPush `€1/1k`; Pusher Beams `$29/1k devices` + E2E encrypt; EngageLab `DAU-based + OEM Huawei/Xiaomi` +40% CN delivery.

## 10. Gap to PushPanel (current M0-M7)
- Have: VAPID queue, campaigns, segments (fixed), LP/YouTube, drips, WC plugin, backup, audit, TOTP, live SSE, CSV.
- Missing vs LumaPush: **Email suite**, **8 AIs**, **throttle/frequency/collapse**, **AB 10 variants auto-winner**, **Journey canvas**, **city/tags unlimited**, **In-App/SMS/WhatsApp**, **team RBAC/SSO/white-label**, **OEM FCM fallback**.

