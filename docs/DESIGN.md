# DESIGN.md — PushPanel "Evergreen Console"

> Picked from 2026 research: **Stripe Restrained Tech-Editorial + Linear density + Vercel contrast**
> (opendesigner.io DESIGN.md study 2026-05-23 · Mantlr Stripe/Linear/Vercel synthesis · KitBase 2026 trends).
> Why this one: PushPanel is an operational console (domains, campaigns, tables, sends).
> Stripe's "tables as the primary interface" + Linear's "interaction density, not visual density"
> beats the old marketing-page card-grid. Completely replaces Lumina Indigo (273°) — new hue,
> new chrome, new rhythm. No gradients-as-decoration, no glows, no lift-on-hover.

## 1. Brand & Temperature

- **Voice:** executive operations tool. Quiet chrome, data first. Colour = meaning, never decoration.
- **Hue:** deep forest emerald **162°**. Trust + growth + distinct from indigo.
- **Light:** warm stone paper `#F4F5F2`, ink text, white panels.
- **Dark (first-class, flash-free):** forest-black `#0B100E`, panel `#121915`, sidebar `#070D0A`.
- **Sidebar is dark in BOTH modes** (Stripe/Linear console wayfinding). Content canvas flips light/dark.
- Never: indigo/violet accents, pastel card tints per feature, hero gradients, blurred glows.

## 2. Color Tokens (oklch, semantic only)

Light `:root`:
`--bg: 0.965 0.004 120` (stone) · `--panel: 1 0 0` · `--ink: 0.23 0.012 260` ·
`--ink-2: 0.45 0.012 260` (secondary) · `--ink-3: 0.60 0.010 260` (tertiary) ·
`--line: 0.88 0.006 120` · `--line-strong: 0.82 0.008 120` ·
`--brand: 0.43 0.13 162` (`#0B6B4F`) · `--brand-ink: 0.99 0 0` · `--brand-deep: 0.36 0.12 162` ·
`--danger: 0.55 0.22 25` · `--ok: 0.55 0.14 162` · `--warn: 0.70 0.15 75` · `--info: 0.60 0.12 240`

Dark `.dark`:
`--bg: 0.16 0.015 160` · `--panel: 0.20 0.018 160` · `--ink: 0.93 0.006 120` ·
`--ink-2: 0.72 0.010 160` · `--ink-3: 0.58 0.010 160` ·
`--line: 1 0 0 / 9%` · `--line-strong: 1 0 0 / 15%` ·
`--brand: 0.78 0.13 162` (mint, luminous on black) · `--brand-ink: 0.14 0.03 162` · `--brand-deep: 0.70 0.12 162`

Sidebar (both modes): `--rail: #0A1511` light-mode / `#070D0A` dark · rail ink `#D7E0DA` ·
rail muted `#8FA098` · rail line `white/8%` · active row `white/8%` + 2px emerald bar.
Status: ok emerald / warn amber / danger red / info blue / neutral stone. One accent per screen.

## 3. Typography (the brand anchor)

- One family: Geist Sans + Geist Mono (already loaded). No display font.
- Scale: micro `11px/600/0.06em uppercase` (table heads, section eyebrows) · body `13–14px` ·
  titles `20–24px/650/-0.02em` · KPI numerals `28–32px/650/tabular` · mono for ids, codes, counts.
- `font-feature-settings: "tnum" 1, "cv05" 1`. All counts/dates `tabular-nums`.
- Links: underline-offset 3px, only on hover except inline docs.

## 4. Spacing & Radius & Border

- 4px base. Padding ladder `8 / 12 / 16 / 24`. Sections `32`. Never 20/28.
- Radius: **6px** controls/cards, 4px chips/inputs-inner, 8px auth panel + dialog. Max 8px anywhere
  (Linear rule: nothing over 8px). Pills only for status badges + mobile nav.
- Borders: 1px `--line` everywhere. **No card shadows in light mode** (border is the elevation);
  dark mode `0 1px 2px black/40` only. No `shadow-premium`, no glow, no `backdrop-blur` on panels.
- Tables: 44px rows, 12px cell-x, header 36px uppercase micro, row hover `bg-muted/60`, no zebra.

## 5. Layout (console, not marketing page)

```
┌──────┬──────────────────────────────────┐
│ RAIL │ TOPBAR  breadcrumb · status · CTA│
│ 248px├──────────────────────────────────┤
│ dark │ CONTENT max-w-7xl · 24px gutters │
│      │ tables first · panels second     │
└──────┴──────────────────────────────────┘
```
- Rail: fixed, dark, collapsible to 64px icons (persist localStorage). Groups: Operate
  (Dashboard, Domains, Campaigns, Analytics) · Grow (Segments, Templates, LP links, Channels,
  Automations, Journeys, Email) · System (AI Studio, Workspaces, Status, Logs, API, Guides, Team,
  Settings, Profile). Active = `white/8%` + emerald left bar + white text.
- Topbar: 56px, stone/white, bottom hairline. Left: mobile menu + breadcrumb
  (`Workspace / Section`). Right: ops dot, theme switch, `New send` primary button.
- Content: `max-w-[76rem]`, `px-6 py-6`, dense. Page head = eyebrow + H1 + description + actions
  on one row, hairline below. No centred narrow column except auth.
- Mobile: rail → drawer; section strip → horizontal scroll pills; tables → horizontal scroll.

## 6. Components (API before props)

- **btn:** `h-9 px-3.5 rounded-md text-[13px]/600`. primary = emerald solid (white/mint text);
  secondary = 1px border stone; ghost = transparent; danger = red solid/ghost. Hover = darken 4%,
  active = translateY(0) scale(0.99). Focus = 2px emerald ring offset 2. Disabled 50%.
- **input/select/textarea:** `h-9 rounded-md border-line bg-panel px-3 text-[13px]`. Focus:
  `border-brand + 3px brand/25% ring`. Error: red border + red 3px ring + message.
- **panel:** `bg-panel border-line rounded-md`. Head `px-4 py-3 border-b`, body `p-4`.
- **table:** wrap `border rounded-md overflow-x-auto`. `thead th`: micro uppercase tertiary,
  `tbody td`: 13px, row border-t, hover tint. Numeric right-aligned tabular.
- **badge:** `h-5 px-2 rounded-full text-[11px]/600` + 6px dot. Tones: ok/warn/danger/info/neutral.
- **kpi:** label micro tertiary → value 30px tabular → delta line 12px with dot.
- **empty:** dashed border panel, centred, 1 CTA max. **dialog:** 8px, panel bg, 1px border, no blur
  backdrop `black/50`. **code:** mono 12px, stone well, copy button ghost.

## 7. Motion (physical, 120–180ms)

- `ease-out cubic-bezier(0.2,0.7,0.3,1)`. Durations: hover 120ms, open 160ms, drawer 200ms.
- Animate `background/border-color/opacity/transform` only. No layout animation, no card lift,
  no scale-on-hover for rows (translateY forbidden on cards). Fade/slide 6px for menus/dialogs.
- `prefers-reduced-motion: reduce` → zero animation. Skeletons: flat shimmer off; use pulse blocks.

## 8. Microstates (80% of premium)

Every control ships 6 states: default / hover / focus-visible / active / disabled / loading
(spinner 14px + `aria-busy`). Every page ships: loading skeleton (table rows, not cards),
empty (dashed + CTA), error (red panel + retry), zero-filter (clear-filters). Toasts bottom-right,
mono ids. Focus always visible. Touch targets 36px desktop, 44px coarse pointers.

## 9. Anti-patterns (forbidden)

1. No indigo/violet/blue primary. 2. No gradient buttons/panels except rail logo chip.
3. No card `translateY(-1px)` lift or coloured glow shadows. 4. No radius over 8px.
5. No more than ONE accent per view (status colours excluded). 6. No centred marketing hero
inside the console. 7. No icon-tint rainbow (all rail icons monochrome, active = white).
8. No `backdrop-blur` content panels. 9. No body text under 13px. 10. No new bespoke
one-off classes — compose from §6 tokens; page-specific CSS lives in the component, not globals.

## 10. E2E contracts (must not break)

Keep stable: all `<label>` texts, button accessible names (`Create domain`, `Create campaign`,
`Estimate`, `Create segment`, `Save segment`, `Create automation`, `Create link`, `Send test push`,
`Sign in`, `Verify code`, …), `data-testid="stat-*"` (derived from KPI label), headings hierarchy,
`code:has-text("otpauth://")`, `#tfa-disable-password`, `input[type=file]`, `tbody tr` rows.
Brittle `div.rounded-xl.border.bg-card` locators are replaced by `data-testid="row-*"` /
`data-entity` hooks in this redesign (tests updated alongside).
