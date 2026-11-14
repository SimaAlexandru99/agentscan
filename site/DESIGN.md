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

CSS only, in `app/globals.css`; `transform` and `opacity` only (the explainer
wire animates SVG `stroke-dashoffset`). Every base style is the end state and
each keyframe names only its start frame, played with `both` fill: without JS,
or once the animation ends, everything is visible.

- Curves: `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` for entrances and
  feedback, `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)` for things that
  move on screen (wire, bars).
- Entrances (`.rise`): 500 ms, 8 px rise. Stagger 60–80 ms through
  `animationDelay` (hero 70 ms, changelog 60 ms, results rows 70 ms).
- UI feedback 140–220 ms: `.chip` buttons and pills press to `scale(0.97)`;
  `.swap` (agent selector panel) rises in 220 ms. Hover effects only inside
  `@media (hover: hover) and (pointer: fine)`.
- Config-vs-disk explainer: the wire draws (900 ms, from 700 ms), the break
  marker snaps in (220 ms at 1650 ms), the missing script dims to 0.35
  (300 ms at 1600 ms), the finding rises (400 ms at 1950 ms). Plays once on
  mount; "Run again" re-mounts it with a React `key`.
- Bars: `/checks` provenance bars grow from `scaleX(0)` (600 ms); the
  `/results` findings bar shrinks from full width to 251/692 (1200 ms).
- `prefers-reduced-motion: reduce`: entrances become 160 ms opacity fades; the
  explainer and bars drop their animation and show the end state.

## Components

- shadcn `Button` (base-nova) for primary/ghost actions
- `CopyCommand` — client clipboard for `npx @chimix/agentscan check`
- `ConfigDiskExplainer` — client; `.claude/settings.json` names a hook
  script, `.claude/hooks/` lacks it, `claude.hook.missing-script` (error,
  score 90/100). Plays once, "Run again" re-mounts it
- `AgentSelector` — client; pills with `aria-pressed` pick one of ten agents
  and show the files read and one finding it can raise (data in `lib/home.ts`)
- `ChecksFilter` — client; search, agent family and severity filters over the
  server-rendered `/checks` table. Without JS every row shows
- `InlineCode` — renders markdown backticks in release text as `<code>`
- `SiteHeader` / `SiteNav` (client, `aria-current="page"` from
  `usePathname`) — Checks, Results, Changelog, Docs, GitHub
- `SiteFooter` — the same plus About, Contact, Privacy, npm

## Out of scope

No fake logos, testimonials, or invented metrics. Product claims stay aligned
with repo `README.md` and `PRODUCT.md`.
