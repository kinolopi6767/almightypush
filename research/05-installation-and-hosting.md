# 05 — Installation, Hosting & Buying Process

## Server Requirements (official docs)
| Requirement | Details |
|---|---|
| Server type | **VPS (Virtual Private Server)** — DigitalOcean, Vultr, Linode, AWS, GSC, etc. |
| Access | **sudo / root SSH access** |
| OS | **Ubuntu 24.04** |
| RAM | **1 GB minimum** (basic; scale for millions of subscribers) |
| Cost | ~$6/month typical 1GB Droplet "sufficient for millions of subscribers" |

⚠️ Product **only works on a dedicated VPS** — shared hosting is not supported (per Terms). A "Powered by" / watermark notice must be kept in notification prompts.

## Installation Flow
1. Buy LaraPush → order email contains **license key** (also on `larapush.com/orders/`).
2. Create VPS (e.g., DigitalOcean Droplet), set root password, add A record (`push` subdomain or `@` domain) pointing to the server IP.
3. (Optional) Enable root login: run script from `https://cdn.larapush.com/uploads/allow-root-login.sh`.
4. Go to your LaraPush account → click **"Claim free installation"** → enter IP, root password, domain → **Create Installation**.
5. Wait ~5 minutes → installation status "Completed".
6. Visit panel domain → register with Name, Email, Password, **License Key**.
7. Connect domains → start campaigns.

- "Setup in 10 minutes" / panel delivered within **15 minutes** (how-to-buy page); free installation included.

## How to Buy
1. **Contact Us** form or hotline (sales exec calls back, demo).
2. **Setup process** — after payment, provide server details; team installs the panel.
3. **Launch** — add site and run first campaign.
- **Free demo** available ("View Demo Right Away!" — demo request form with name/phone/email/website).
- Buy via `/checkout` (Startup/Pro/premium + EMI option) or upgrade via `/upgrade-checkout`.

## Checkout Details (from checkout page source)
- Account details (name, email, mobile, password), billing details (address, pincode → city/state auto-lookup for India), company details (business/GST optional).
- Payment method selection: **Card** or **Card EMI** (Razorpay).
- Coupon code field; invoice summary table; currency shown in USD + INR (rate ~96).
- Cart abandonment tracking, UTM tracking, 15-day re-engagement notifications.

## Migration (from another push service)
- **Migration add-on**: transfer existing subscribers/tokens from OneSignal, TruePush, iZooto, etc., to LaraPush Pro — "no matter how big your data is."
- Auto-apply **50% discount coupon (MIGRATION50)** for migration-eligible customers.
- Free migration of current subscribers promised ("We will migrate all of your existing tokens").

## Post-Sale Support
- **support.larapush.com** → Atlassian Jira Service Desk (ticketing).
- Support hours: Mon–Fri, 09:00–18:00 IST.
- Scope: installation assistance and product error checking (not full-time consulting).
- Priority support with Premium add-on.

## Updates
- Auto-update available inside panel (System Settings → Update).
- Same-major updates free; major-version upgrades paid.
- Update panel with license key validation.