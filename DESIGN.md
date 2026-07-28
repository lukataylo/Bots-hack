# RINGSIDE ARENA — Design System v2 (GAME HUD)

Supersedes the old Binance x Ferrari terminal direction entirely (and the scout scaffold's
Vercel x Pitchfork contract before it). The product now looks like a premium robot-combat
game broadcast HUD. Reference mockup: `design/ref/mockup-full.jpeg` (follow its layout,
hierarchy, and material language as closely as the live data allows).

## Direction

Battle-worn arcade metal. Every panel is a physical plate: beveled, riveted, edge-lit,
scratched. Deep purple space + gold accents + team blue/purple. Chunky display type for
numbers and names. The robots are characters (blue mascot vs purple gear-bot), the crowd is
robots, the arena is a purple disc with the gold bot-face logo.

## Palette

- Background space: #17102A (deep violet-black), vignette to #0B0716
- Panel base: #1A1230 with the plate PNGs framing it
- Gold: #F5B426 (headers, VS, accents, SETTLE)
- Team A blue: #3D7BFF (fighter A side)
- Team B purple: #9B4DFF (fighter B side)
- Alert red: #E03A2F (LOCK LINES, live dot) — from button-red.png
- Text: #F2EFFF primary, #9A8FC0 dim
- Success green stays only inside trace log semantics

## Asset manifest (public/assets/, all pre-keyed transparent PNGs)

| file | use |
|---|---|
| bot-blue.png | fighter A mascot card art + fighter rig panel |
| bot-purple.png | fighter B mascot card art + fighter rig panel |
| arena-empty.png | physics-runs panel backdrop (idle) |
| arena-fight.png | physics-runs panel backdrop (running: bots + energy arcs) |
| crowd.png | crowd pulse panel footer strip |
| icon-gold.png | app logo mark (header, prediction plate) |
| panel-strip-purple.png | slim header/label strips |
| panel-blue.png | fighter A card frame (9-slice border-image) |
| panel-purple.png | fighter B card frame + generic large panels (9-slice) |
| panel-plain.png | small dark panels (9-slice) |
| panel-strip-gold.png | trace feed row / octagon-badge strip |
| plate-gold.png | gold plates: RUN MATCHUP button, callouts |
| button-red.png | LOCK LINES button skin |
| dropdown.png | select controls skin |
| bar-blue.png | segmented confidence bar A (fill by clipping width) |
| bar-purple.png | segmented confidence bar B |
| bar-split.png | crowd split bar (purple vs gold, clip at split point) |
| vs-badge.png | the VS emblem between fighters |
| sprites-run.png | pixel run-cycle sheet; easter-egg loading animation only |

## Rules

- Plates are `border-image` 9-slices or full `background-image`; never stretch a plate's
  corners.
- Numbers and fighter names: chunky bold uppercase, tabular. Odds stay HUGE.
- All the working mechanics (trace stream, odds arithmetic, QR, lock/settle, ledger,
  show mode stages) keep their behavior — this is a skin, not a rewire.
- Segmented bars: render the PNG at fixed aspect, overlay a right-side mask to show fill %.
- The honest states stay loud: INSUFFICIENT EVIDENCE renders on a gold-framed dark plate
  like the mockup's prediction module.
- No em dashes, no emojis in copy.
- Projector-safe: keep text >= 14px equivalent, contrast >= 4.5:1 on plate backgrounds.
