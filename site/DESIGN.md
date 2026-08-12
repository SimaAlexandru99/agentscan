# Signal Amber — design system

Dark-first marketing system for [agentscan.space](https://agentscan.space).

## Intent

Quiet terminal energy: warm charcoal canvas, one amber signal for CTAs and
finding emphasis. The brand name **agentscan** is the hero-level mark; copy and
the static terminal demo do the rest. No purple, no magenta, no gradient text.

## Tokens

Set on `:root` and `.dark` in `app/globals.css`. The document root always has
`className="dark"`.

| Token | Value | Role |
|-------|-------|------|
| `--background` | `oklch(0.12 0.015 91.936)` | Warm dark canvas |
| `--foreground` | `oklch(0.96 0.01 91.936)` | Primary text |
| `--primary` | `oklch(0.795 0.184 86.047)` | Signal Amber (~`#f0b100`) |
| `--primary-foreground` | `oklch(0.421 0.095 57.708)` | Text on amber |
| `--muted-foreground` | `oklch(0.72 0.02 91.936)` | Supporting prose |
| `--sidebar-primary` | same as `--primary` | No purple sidebar accent |

Borders stay low-contrast white alpha. Radius is slightly soft (`0.75rem`);
buttons use `rounded-full` for pill CTAs.

## Type

- **Sans:** Geist → `--font-sans`
- **Mono:** Geist Mono → `--font-mono`

Wired in `app/layout.tsx` via `next/font/google` and consumed by shadcn theme
tokens in `globals.css`.

## Layout

- Max content width `max-w-3xl`, horizontal padding `px-6`
- Landing sections: one job each (hero, trust, honesty, install)
- Docs: long-form read mode with code blocks and a flags table
- Trust section is a bordered prose list — not an icon+title+text card grid

## Craft floor

From `.agents/skills/impeccable/SKILL.md`:

- No eyebrow kickers above headings
- No icon+title+text card grids as page structure
- No gradient text

## Motion

Landing uses sparse `animate-in` fades/slides on hero blocks only — presence,
not decoration. Docs stay static for reading.

## Components

- shadcn `Button` (base-nova) for primary/ghost actions
- `CopyCommand` — client clipboard for `npx @chimix/agentscan check`
- `TerminalDemo` — static README-shaped `hook.missing-script` sample
- `SiteHeader` / `SiteFooter` — Docs, GitHub, npm

## Out of scope

No fake logos, testimonials, or invented metrics. Product claims stay aligned
with repo `README.md` and `PRODUCT.md`.
