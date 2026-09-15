# Visual direction — forensic ledger

Status: **locked for visual punch** (RB UI redesign). Product scope unchanged — React/API behavior stays as RB-010/stream wiring; this doc covers presentation only.

## Subject

Evidence UI for **synthetic game-economy rule violations**: a left-aligned case file / forensic ledger, not a chat wall or SaaS dashboard kit.

## Palette

| Token | Hex | Role |
| --- | --- | --- |
| `--ink` | `#071018` | Page background |
| `--panel` | `#122033` | Primary surfaces |
| `--panel-2` | `#1A2B40` | Nested rows / secondary surfaces |
| `--border` | `#2A3F55` | Hairlines |
| `--paper` | `#E7EEF6` | Primary text |
| `--mute` | `#8FA3B8` | Secondary text |
| `--copper` | `#8B5A2B` | Findings / violations — **the** bold accent |
| `--signal` | copper alias | Fixed-control / `blocked_as_expected` uses **copper outline, transparent fill** — never teal/green |
| `--focus` | `#E8C07D` | `:focus-visible` and caution notes |

Do **not** introduce acid green, cream + terracotta kits, or a second “success / secure” green.

## Type

- **Fraunces** (Google Fonts) — brand / headings
- **Source Sans 3** — UI body and controls
- **Mono** — hashes and IDs only (not general body copy)

## Layout cues

- Left-aligned case file; content max-width, flush left (not centered marketing card stack)
- Copper **left spine** on finding detail **and** activity timeline when events exist (continuous scan spine)
- Timeline: denser card stack; copper mono `#n` sequence markers
- Quieter stream banner (sentence case, muted bar — not shouty all-caps chrome)
- Prefer underline / copper rail nav over pill tab chrome

## Explicit non-goals (visual)

- SaaS-card kit (heavy radius, soft marketing shadows, badge walls)
- All-caps eyebrows / status screaming
- Middle-dot (`·`) meta chrome
- Arrow (`→`) on buttons
- Green “secure” treatment after a bounded clean / fixed control run

## Accessibility

- Honor `prefers-reduced-motion`
- Keep clear `:focus-visible` rings using `--focus`

## Related

- `docs/ui/three-view-spec.md` — view wiring and API surface
- Finding detail copy must continue to discourage “secure” language; fixed control stays `blocked_as_expected`

## A/B decision (2026-09-15)

Ship this direction (Candidate A / PR #21) over night-market Candidate B (#24). Critics: type+palette → A; density → B. Adopted B’s denser timeline + continuous spine into A. Pre-merge nits: no ALL-CAPS eyebrows; no green/`teal` fill on `blocked_as_expected`.
