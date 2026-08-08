# 08 — Business Ecosystem

## Affiliate Program
- **Commission: up to 20%** direct commission.
- Dedicated page: `larapush.com/affiliate`, signup at `larapush.com/join-affiliate`.
- Rules (from Terms):
  - Fraudulent activity → suspension; self-referrals not paid.
  - 60-day validity of affiliate opportunities.
  - Coupon-code-only/coupon-website affiliates may be disqualified (must genuinely promote).
  - "**Refer and Earn Anonymously**" — upload leads individually or in bulk (affiliate uploads contacts; responsibility for data correctness/lawfulness lies with the affiliate).
- Tracking: UTM parameters (utm_source/medium/campaign) in localStorage synced to backend.

## ZeroCLI — Managed LaraPush Hosting
- **zerocli.com** is the managed-hosting arm of the same company (Brandzzy).
- Deploys **LaraPush, n8n, WordPress, Discourse, Mattermost, Nextcloud, Excalidraw, Uptime-Kuma, Immich, Passbolt**.
- Features: 1-click deployment, 99.9% uptime guarantee, 24/7 monitoring, automated SSL, point-in-time backups, performance analytics, 500+ deployments, 50+ enterprise clients.
- Status page lists "ZeroCLI (Managed LaraPush Provider)" as an operational component — i.e., users can buy managed hosting instead of self-managing a VPS.

## Support Infrastructure
- **support.larapush.com** → Atlassian Jira Service Desk portal.
- Status page: **status.larapush.com** (Atlassian Statuspage) tracking:
  - LaraPush Portal (Website) — 100% uptime (90 days)
  - LaraPush CDN — 100%
  - External Services (DigitalOcean, Cloudflare, FCM) — 100%
  - ZeroCLI (Managed LaraPush Provider) — 100%
- No incidents in the past 90 days (as of Aug 8, 2026).

## Sales & Marketing
- Sales hotlines: +91 9403891455 (IN), +1 9179248448 (US).
- Telegram (@larapush), Skype, email — direct founder-level chat.
- **Free demo** funnel with lead capture (name/phone/email/website).
- Blog articles (SEO plays: "best push notification services", "how do push notifications work").
- Third-party affiliate/comparison pages (karankk.com/lara, larapushnotifications.com, larapushnotification.com) — many are affiliate sites linking with `?ref=`/`/ref/` UTM codes, indicating a wide affiliate network.
- Trustpilot + "Brands Who Trust US" logos (customer-1..9).
- WOCS (Web of Customers) widgets for testimonials on site.

## Revenue Model Summary
- One-time license sales (Startup $499 / Pro $799 / Premium $399).
- Paid major-version upgrades (e.g., Startup→Pro $300; v4→v5 ~$177+).
- Premium add-on + migration add-on.
- Affiliate commission payouts (20% of sale).
- Managed hosting upsell via ZeroCLI.
- Support extension sales (via upgrades).

## Legal & Compliance Bits
- License: perpetual, single-server, no refunds.
- Data consent: LaraPush collects panel statistics/usage patterns for product improvement (ToS: Data Consent Directive).
- Depends on Google FCM — no liability for FCM downtime.
- GST registered in India; US office listed (New York) — likely for international payment/branding.

## URLs & Entry Points (complete list from sitemap)
```
/  /features/  /pricing/  /contact/  /about/  /privacy-policy/
/join-affiliate/  /migration/  /how-to-buy/  /guide/  /interviews/
/upgrade/  /login/  /signup/  /audience-segmentation/  /lp-links/
/automation/  /youtube-links/  /automagic/  /ios-push/  /templates/
/wordpress-plugin/  /backup/  /checkout  /upgrade-checkout  /orders/
/affiliate  /blog/{posts}  /terms/  /test/ (demo/PWA start_url)
```
Subdomains: `status.larapush.com`, `support.larapush.com`, `cdn.larapush.com`.
Developer assets: **Postman collection "LaraPush API"** (public, 8 items, created Sep 2022; requires panel v3+; toggle in Settings; `Host` env var = panel URL); **docs repo** TheLarapush/LaraPush-Docs-Source (open).