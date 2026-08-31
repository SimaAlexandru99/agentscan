# Numeric thresholds and their evidence

**Read:** 2026-08-31. Every number a check asserts is listed here with what
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

## Claude skill listing budget — `skill.description-budget` (vendor-recommendation)

**Source:** https://code.claude.com/docs/en/skills
**Read:** 2026-08-31

Quoted:

> The budget scales at 1% of the model's context window. […] To raise the
> budget, set the `skillListingBudgetFraction` setting (e.g. `0.02` = 2%) or
> the `SLASH_COMMAND_TOOL_CHAR_BUDGET` environment variable to a fixed character
> count. […] each entry's combined text is capped at 1,536 characters
> regardless of budget. The cap is configurable with `skillListingMaxDescChars`.

Listing text is `description` (or the first markdown paragraph) plus
`when_to_use`. agentscan cannot observe the model context window, so the
fallback ceiling is `thresholds.skillListingChars` (default **8000
characters**). Per-entry cap is `thresholds.skillListingMaxDescChars` (default
**1536**). Do **not** use a fixed 16000-byte value as the runtime budget.
`thresholds.skillDescriptionBytes` is a deprecated alias of `skillListingChars`.

This is **not** applied to Agent Skills schema profiles. The Agent Skills spec
caps a single description at 1024 characters; that is a different check.

Confidence: **high as a vendor recommendation** for the 1% / 1536 figures;
the 8000-character fallback is ours because the window is unknown.

## Agent Skills `SKILL.md` > 500 lines — `agent-skills.skill.body-too-large` (vendor-recommendation)

**Source:** https://agentskills.io/specification
**Read:** 2026-08-31

Quoted: "Keep your main `SKILL.md` under 500 lines." Info only.

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
**Also:** https://learn.chatgpt.com/docs/config-file/config-advanced
**Read:** 2026-08-31

Quoted:

> Codex skips empty files and stops adding files once the combined size reaches
> the limit defined by `project_doc_max_bytes` (32 KiB by default).

Configurable from `.codex/config.toml`. Cumulative across the effective chain
(see [codex-agents-md.md](codex-agents-md.md)). Not applied to Claude
`CLAUDE.md`.

## Cursor project rules > 500 lines — `cursor.rule.too-large` (vendor-recommendation)

**Source:** https://cursor.com/docs/rules

Quoted (read 2026-08-30):

> Keep rules under 500 lines
