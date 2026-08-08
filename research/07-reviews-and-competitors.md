# 07 — Reviews, Reputation & Competitors

## Reviews

### Trustpilot
- Rating: **4.4 / 5 ("Excellent")** — based on **87 reviews** (Aug 2026, per footer).

### WordPress.org Plugin
- Rating: **4.7 / 5** — 13 reviews (12× five-star, 0× four, 0× three, 0× two, 1× one-star).

### Customer testimonials (site)
- **Crida.in** (media buyer): "100% recommended... one of the best push notification services out there."
- **MPNRC.org**: "LaraPush setup is hassle-free... notifications delivered on time."
- **NHMPunjab.in**: "not limiting anything on any level — unlimited domains, tokens, and customized notifications without any extra charge."
- Affiliate/comparison site (lara.karankk.com) testimonials: Ranjan Sahoo (small business owner), Ankur Agarwal (blogger).
- Review (angraj, 2024): gained **1.53M subscribers in 9 months**; ~750K subscribers in another case with **30% retention lift** (mahesh500).

### Critical review (lorisfreez, Feb 2025, WP.org — "$800 USD wasted")
- Complaints: low conversion/CTR vs. other tools (450 subscribers → 1 click), support replies, license activation prevents refund, need to buy a separate server not clearly communicated, affiliate link on own site.

## Competitor Landscape

| Competitor | Model | Notes |
|---|---|---|
| **OneSignal** | SaaS, freemium + monthly | The reference competitor in all LaraPush copy; pay-as-you-grow |
| **iZooto** | SaaS, monthly | Indian competitor, dedicated comparison articles exist |
| **TruePush** | SaaS | Mentioned in migration add-on list |
| **PushEngage** | SaaS, monthly | Blog-worthy competitor |
| **PushDaddy** | SaaS | — |
| **Pusher/Pushwoosh, Webpushr, PushAlert etc.** | SaaS | Alternative lists on third-party blogs |
| **Laravel Forge / Deployer / Larapush (GitHub packages)** | Different domain | Same name, unrelated OSS deploy tools (`brunocfalcao/larapush`, `laraning/larapush`) |

## LaraPush Differentiators vs SaaS
1. **One-time cost** vs recurring monthly.
2. **Unlimited everything** vs per-domain/per-subscriber tiers.
3. **Self-hosted data ownership** (tokens on your server; SaaS "uses your tokens to send ads" claims).
4. **No ads injected** to subscribers (vs monetization plans that spam users).
5. **5x faster delivery** claim + 1.5M/min throughput.
6. **Exclusive AutoMagic Push** feature (claim: not available anywhere else).
7. **Migration service** for existing tokens.

## Weaknesses / Criticism (observed in research)
- No refunds after activation; license per single server.
- Support limited (6–12 months) despite "lifetime" product; support hours IST business-hours only.
- Encrypted code — no source access, can't be modified (ToS says modification/reverse engineering prohibited).
- Requires own VPS + own Firebase project (hidden infra cost ~$6–30/mo server, ~$25/mo Google tiers at scale).
- Docs sub-pages on larapush.com/guide currently return 404 for some routes; full doc set recovered via GitHub source (TheLarapush/LaraPush-Docs-Source) — content itself is decent, site routing is broken (noted Aug 2026).
- Marketing copy filled with hyperbole ("sell your house", emoji-heavy) — credibility concerns for professional buyers.