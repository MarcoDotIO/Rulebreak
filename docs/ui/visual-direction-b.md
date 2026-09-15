# Visual direction B — night market ticker

Status: **A/B Candidate B** (parallel to forensic-ledger Candidate A on PR #21). Product scope unchanged — React/API behavior stays as RB-010/stream wiring; this doc covers presentation only.

## Subject

Evidence UI for **synthetic game-economy rule violations**: a left-aligned night-market ticker — dense event tape, amber price-tick accents for findings, not a chat wall or SaaS dashboard kit.

## Palette

| Token | Hex | Role |
| --- | --- | --- |
| `--ink` | `#0B0A10` | Page background |
| `--panel` | `#12101A` | Primary surfaces |
| `--panel-2` | `#1C1828` | Nested ticker rows / secondary surfaces |
| `--border` | `#2E2940` | Hairlines |
| `--paper` | `#EDE8F5` | Primary text |
| `--mute` | `#9A91B0` | Secondary text |
| `--amber` | `#F0A202` | Findings / violations — **the** bold accent |
| `--signal` | `#5BC0BE` | Fixed-control / `blocked_as_expected` **only** — never a “secure” badge |
| `--focus` | `#FFE08A` | `:focus-visible` and caution notes |

Do **not** introduce acid green, cream + terracotta kits, copper/Fraunces ledger chrome (that is Candidate A), or a second “success / secure” green.

## Type

- **Syne** (Google Fonts) — brand / headings / sequence ticks
- **DM Sans** — UI body and controls
- **Mono** — hashes and IDs only (not general body copy)

## Layout cues

- Left-aligned ticker; content max-width, flush left (not centered marketing card stack)
- Amber **left rail** on finding detail when a finding exists
- **Denser** timeline: tighter row gaps, thin amber tick on each event row, tabular sequence numbers
- Quieter stream banner (sentence case, muted bar — not shouty all-caps chrome)
- Prefer underline / amber rail nav over pill tab chrome

## Explicit non-goals (visual)

- SaaS-card kit (heavy radius, soft marketing shadows, badge walls)
- All-caps eyebrows / status screaming
- Middle-dot (`·`) meta chrome
- Arrow (`→`) on buttons
- Green “secure” treatment after a bounded clean / fixed control run
- Copying Candidate A’s copper + Fraunces forensic ledger

## Accessibility

- Honor `prefers-reduced-motion`
- Keep clear `:focus-visible` rings using `--focus`

## Related

- Candidate A: `docs/ui/visual-direction.md` on PR #21 (forensic ledger)
- `docs/ui/three-view-spec.md` — view wiring and API surface
- Finding detail copy must continue to discourage “secure” language; fixed control stays `blocked_as_expected`
