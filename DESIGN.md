# Scout — The Startup Review

Locked brand contract (design-beast, 2026-06-11). Remix: **Vercel 60% x Pitchfork 40%**, adapted
for Scout. Every design pass executes TOWARD this file; it beats any tool's house taste.

The conceit: Scout reviews startups the way Pitchfork reviews records. Each company brief is a
REVIEW: an opinionated verdict, evidence, and a big boxed score. Vercel's grayscale chrome and
Geist density keep it technically credible; Pitchfork brings the serif headline, the hot orange
punctuation, and the editorial confidence.

Mood: opinionated, calm, technically literate. A magazine about startups, written by an operator.

## 1. Color (single grayscale ramp + one accent)

```css
--bg:            #ffffff;   /* page */
--bg-alt:        #fafafa;   /* table head, composer */
--surface:       #f4f4f5;   /* hover fills */
--ink:           #0a0a0a;   /* text, primary buttons, strong scores */
--ink-muted:     #52525b;   /* secondary text, mid scores */
--ink-dim:       #a1a1aa;   /* metadata, weak scores */
--border:        #e4e4e7;
--border-strong: #d4d4d8;
--accent:        #ff5d1f;   /* Pitchfork orange. Links, section markers, pull-quote rule, focus */
--accent-hover:  #e64a0e;
--accent-soft:   #ffead9;
--danger:        #b54a3a;   /* analysis failures only */
--ok:            #2f7d57;   /* good outcomes only (replied/call/hired) */
```

Rules: orange appears at most twice per viewport. Never a button fill. Never a background wash.
Score strength is encoded by INK DENSITY (strong=ink, mid=muted, weak=dim), not by traffic-light
colors. Light surface only; no dark mode until the product earns one.

## 2. Typography

- **Display serif** (review headlines, the big score numeral, priority-target name):
  Newsreader 500/600, fires at 34px+ only. Tight leading, -1% tracking.
- **UI + body:** Geist Sans 400/500/600. Body 14/1.6, app density.
- **Mono:** Geist Mono for URLs, evidence links, ranks, tabular data. `tabular-nums` on every number.
- Scale: 11 / 12 / 14 / 16 / 20 / 28 / 40 / 56 / 76.
- Section markers: 11px Geist 600, uppercase, 0.14em tracking, orange.

Serif never drops into UI controls, table cells, or body copy.

## 3. Components

- **Score box** (the signature): bordered square (1.5px ink border), serif numeral inside,
  no shadow, no gradient, solid ink color by tier. Like a Pitchfork score.
- **Primary button:** ink fill, white text, radius 6, padding 9/16, Geist 500. Hover: #27272a.
- **Secondary button:** white fill, 1px border, ink text. Hover: border-strong.
- **Card/table:** white fill, 1px border, radius 8, flat. Hover: border-strong or `--surface` row fill.
- **Pull-quote (best move):** serif 24-28px, 3px ORANGE left rule, 20px left pad.
  This is the single sanctioned colored left-rule in the app.
- **Input/select/composer:** 1px border, radius 6, focus = 2px orange ring, 2px offset.
- **Status pill:** 11px caps, 1px border, ink-muted; `--ok` ink only for replied/call_booked/hired,
  `--danger` ink for dead/failed.

## 4. Layout

- Board page: 1040px max, magazine masthead (wordmark + dek rule), lead review block, then the
  ranked table. 4px base scale: 4/8/12/16/24/32/48/64/96.
- Review page: full-width title block (section marker, serif h1, dek, byline rule + score box),
  then a 720px reading column for the brief body.
- Hairline rules (1px border) divide sections, magazine-style. No card-on-card nesting.

## 5. Depth and motion

- Flat, border-based. Shadows only on popovers/menus (0 2px 8px rgba(0,0,0,.04)).
- Motion is editorial and purposeful: one entrance per page (title block fades up 8px, 400ms
  ease-out), staggered row reveal capped at the first 10 rows, link underline on hover,
  progress bar width transitions. No pulsing dots, no scanlines, no glow, no decorative loops.
  Full prefers-reduced-motion fallback.

## 6. Copy

- No em dashes, no emojis. CTAs name the action with a verb: "Pull targets", "Analyse 3",
  "Re-analyse", "Copy DM", "Start this build".
- Section markers read like a magazine: PRIORITY TARGET, THE VERDICT, EVIDENCE, THE WEDGE,
  FOUNDER DM, SCORE BREAKDOWN, CALIBRATION.

## Don'ts (carry the anti-tell bans)

No glow-on-dark, no gradient text anywhere (especially numbers), no second accent, no serif below
34px, no orange button fills, no animated status dots, no three-column feature grid, no
glassmorphism, container nesting max 2.
