# Numeric thresholds and their evidence

**Read:** 2026-08-30. Every number a check asserts is listed here with what
backs it. A threshold with no entry is a bug in this file or in the check.

Provenance on these rules is also on `STRUCTURAL_CHECKS`: heuristic rows stay
`info` and must not be described as published requirements.

## `AGENTS.md > 150 lines` — `budget.agents-md` (heuristic)

**Sources:** https://www.betterclaw.io/blog/agents-md-best-practices ·
https://www.morphllm.com/agents-md-guide

The official [AGENTS.md](https://agents.md/) page does **not** require a line
budget. Nested files are allowed; the closest file to the work wins. This check
is a size hint from secondary measurements (diminishing returns past ~150
lines), not a load failure. Keep it at `info`.

Confidence: **low as a requirement, adequate as a hint.**

## `CLAUDE.md > 200 lines` — `budget.claude-md` (vendor-recommendation)

**Source:** https://code.claude.com/docs/en/memory

Quoted (read 2026-08-30):

> Size: target under 200 lines per CLAUDE.md file. Longer files consume more
> context and reduce adherence.

That is official guidance, not a hard load error. The check stays `info`.
Do not cite the unsourced “150–200 instructions / 50 used by the system prompt”
line — it is not on the memory page.

Confidence: **high as a vendor recommendation.**

## Skill descriptions > 16,000 bytes — `skill.description-budget` (heuristic)

**Source:** https://medium.com/@dan.avila7/claude-code-skills-progressive-disclosure-step-by-step-3ca02a4a9f60

At startup Claude Code loads only each skill's name and description. Those
descriptions share a character budget of roughly **1–2% of the context window**.
16,000 bytes ≈ 4,000 tokens ≈ 2% of a 200k window. Configurable via
`thresholds.skillDescriptionBytes`.

This is **not** applied to portable Agent Skills (`sourceProvider: "agent-skills"`).
The Agent Skills spec caps a single description at 1024 characters; that is a
different check.

Confidence: **medium**. Mechanism is attested; the exact 1–2% figure is secondary.

## `MCP servers > 5` — `budget.mcp` (heuristic)

**Sources:** https://pub.towardsai.net/adding-more-mcp-tools-made-my-ai-agent-dumber-accuracy-collapses-past-20-8e754d09bee4 ·
https://albato.com/blog/publications/embedded-mcp-context-bloat-hallucinations

What degrades an agent is the number of **tool definitions** in context, not the
number of servers. agentscan cannot count tools without connecting, which would
break the no-network guarantee, so server count is a proxy.

Confidence: **low as a measurement, adequate as a hint.**

## `.claude/agents` files > 8 — `budget.agents` (heuristic)

**Sources:** https://www.eesel.ai/blog/claude-code-multiple-agent-systems-complete-2026-guide ·
https://www.cloudzero.com/blog/claude-code-agents/

Guidance converges on **three or four** specialised agents as a productive
ceiling. This counts *definitions on disk*, which is a different quantity.

Confidence: **low-medium**. Proxy only.

## Codex instruction files > 32 KiB — `codex.budget.instructions` (vendor-recommendation)

**Source:** https://learn.chatgpt.com/docs/agent-configuration/agents-md

Quoted (read 2026-08-30):

> Codex skips empty files and stops adding files once the combined size reaches
> the limit defined by `project_doc_max_bytes` (32 KiB by default).

Cumulative across the root→cwd `AGENTS.md` chain. Not applied to Claude
`CLAUDE.md`.

## Cursor project rules > 500 lines — `cursor.rule.too-large` (vendor-recommendation)

**Source:** https://cursor.com/docs/rules

Quoted (read 2026-08-30):

> Keep rules under 500 lines
