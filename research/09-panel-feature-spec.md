# 09 — Panel Feature Spec (module-by-module, for our build)

> Purpose: turn LaraPush's panel behavior into a **build spec**. Every module, screen, field, workflow and setting we observed, with plan-level notes. Verified from the 28 official docs + site pages.

## A. Navigation map (sidebar)

- **Dashboard** (home/stats)
- **Campaigns** (list + create)
- **Quick Push**
- **Templates**
- **Automation** (AutoMagic / Push on Publish / Welcome / YouTube)
- **Audience** → Segments, Import/Export, Cleaning (in Domains area)
- **Domains/Websites** → View/Modify, Integration, Import/Export
- **Collect** → LP Links, YouTube Links
- **Server Status**
- **Settings** → General, Advanced, API, Language & Region, Profile, Update, Backup

## B. Dashboard / Home screen

- Subscriber counts per domain; campaigns counts; recent sends; quick actions ("Create Campaign" button @ top).
- Quick Push: URL box → "Create New Campaign" → "Send".

## C. Domains (websites)

**List (View/Modify):** each row: domain name, subscriber count, status (active/paused), actions:
- View / Modify (click opens)
- **Clone** (copy Firebase config to a new domain name — skip re-setup)
- **Integration** (go to per-platform snippet config)
- **Clean Unsubscribed** (yellow broom icon, confirm popup)
- **Re-sync** (re-sync with FCM)
- **Pause collection** (toggle active)
- **Delete**
- **Unhide Firebase config** — license-key gated reveal of the full config block ("Paste Firebase Code Here for Shortcut").

**Add Domain flow:** Default (new Firebase project) vs existing config paste; on save → get snippet.

**Import/Export tab:** per-domain Export (red button) → downloads file; Import (blue button) → upload file. Requires same domain + same Firebase config on destination (migration-add-on for external services).

## D. Campaigns

**Create Campaign form:**
- Launch URL → "Fetch Content" (auto title/description/image)
- Manual override: notification Title, Message, Icon URL, Image URL
- Audience: All / Manual (picker) / Segment
- Advanced: CTA buttons (text+logo+launch URL each), scheduling (Send now? No → date/time + timezone), template picker
- Preview sidebar (right); **Live Preview** (test push to your browser)
- Send split-button: Send / Send & Create Template / Send & Update Template

**Campaigns list:** rows w/ status (completed, scheduled, failed, sending), per-campaign metrics (sent, delivered, clicks, CTR, per CTA-button clicks).

## E. Templates
- CRUD list (cards/table); choose via "Choose Template" modal; any campaign can "Send & Save template"; "Send & Update template".

## F. Automation
- **AutoMagic Push list + create** (fields): AutoPush name; audience (All / Manually / Segment); type **Dynamic** (WP API URL + article range count + Validate button) or **Static** (title, desc, image, buttons…); cron schedule (crontab text; examples; crontab.guru link); Preview; Save; Manage list (pause/edit/delete).
- **Welcome Push**: create welcome campaign (fetch URL content or manual); advanced customizations; auto-fired for new subscribers.
- **Push on Publish**: WP-plugin toggle (Pro); per site.
- **YouTube Push**: channels list (name, LP link, desktop subs, mobile subs, total, status, actions: edit/pause/delete).

## F. Segmentation — full field list
- Table of saved segments; "Create New Segment".
- Create form: **Segment Name**; **Domains (selective… multiple)**; **conditions (AND)**: For subscribers: **URL** (contains/substring on subscription page), **Country**, **State**, **Device** (mobile/desktop), **Browser**, **OS**, maybe **Date** subscribed; **Estimate** button → shows projected size (requires saving segment first in doc flow; estimate shows match count); Save → usable in campaign audience dropdown.

## G. LP Links (Landing Page Links)
- List columns: Target URL / LP Link (shortened) / Clicks / Subscribers / Created.
- Create: target link, **Subscriber Collection Domain**, Link Prompt Text, **Advanced: Force Subscribe**, Create Link → output short link (demo.larapush.com / sl/XXXXX).
- **Get Full Page Script:** prompt text, domain exclude/include selector, collection domain, **Force Subscribe**, Generate → JS snippet for self-hosted prompt.
- Manage: delete/edit per link; per-link stats; global setting: "LP Links Deleted Target URL" (default 404 → custom).

## H. YouTube (Collect section)
- Channels list: LP Link, Desktop Subs, Mobile Subs, Total, Status, Actions.
- Add channel: channel URL (`https://www.youtube.com/@user`), **Prompt Text**, **Force Subscribe**, save → "/yt/XXXXX" short link creation + subscriber tracking (desktop/mobile split).

## I. Server status
- Uptime, load, memory, info — read-only monitor page in panel.

## J. Settings
**General:**
- Default audience dropdown; **Sending Speed** slider (recommended ~1.5M/min; reduce on tinier servers); **Auto Code Integration** toggle (auto-inject snippet into WP); **Host Redirect** toggle; **Use CDN** toggle; **Use UTM** toggle; **Daily Unsubscribe Cleanup** toggle; **API Access** toggle; **LP Links Deleted Target URL** (404 default); Save.

**Advanced:**
- **Worker Count** (increase = faster, unstable on low RAM; start default, docs warn "decrease if crashing/CPU").
- **Allow Duplicates from API/WordPress** (default ON; OFF = dedupe).

**API (Settings→API):** Turn on API → credentials happen; Postman collection onboarding; Host = panel URL.

**Language & Region:**
- System **Language** dropdown (English default; "Change to English");
- **Timezone** (searchable list e.g. Asia/Kolkata; applies to scheduling, backups, reports);
- **ReadMore Text** placeholder customization (e.g. "…Tap to Open" etc. — used when notification truncated > limit).

**Profile:**
- Name (editable); Email (read-only); password change (old/new, allowed charset A–Z a–z 0–9 !@# $; confirm); Update Account; **Logout from all devices**.

**Backup (see later):** manual create; auto schedule; Drive upload. Retention: files auto-deleted after 7 days unless moved (to Drive) or downloaded.

**Update tab:** Installed version vs Available version blocks (`premium-prod-5.1.18` → `5.1.19`), Update button, recommended backup before updates.

## K. Key quirks & behaviors worth replicating (traps)

1. **License-gated**: adding a domain / unhiding Firebase config requires the license key (prevents porting).
2. **Domain = Firebase config identity**: subscribers attach to (domain, Firebase project); not the URL.
3. **iOS PWA files**: auto-gen manifest + SW + icon zip; confirmation boxes gate onboarding UX (typical "I confirm popup is visible" steps) — example of "guided setup" we can replicate/improve.
4. **Fetch-Content + live preview**: campaign forms are designed for *non-technical* publishers — one-URL-to-send flow is the core UX pattern.
5. **Sending-speed knob** = visible Advanced / perf control (we should expose per-worker queue/lane analog in our product).
6. **Auto updates** built into panel (not marketplace-dependent).
7. **Encrypted code** is a pricing/protection choice — we can do better (open source friendly, or dual open/licensed).

## L. API surface (for our API doc, from collection + docs)
- `POST send push to all` (domainId, campaign body)
- `POST send push to segment` (segmentId)
- `POST send push to subscribers + list (ids)`
- list campaigns; home stats; domain CRUD (sub count).
- POST to validate WP API (used by AutoMagic dynamic check).
- Auth: panel issues API key/token (Bearer).