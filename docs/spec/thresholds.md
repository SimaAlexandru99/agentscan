# Numeric thresholds and their evidence

**Read:** 2026-08-09. Every number a check asserts is listed here with what
backs it. A threshold with no entry is a bug in this file or in the check.

## `AGENTS.md > 150 lines` — `budget.agents-md`

**Sources:** https://www.betterclaw.io/blog/agents-md-best-practices ·
https://www.morphllm.com/agents-md-guide

Measured across 2,500+ repositories: past ~150 lines additional content
delivers diminishing returns and raises inference cost **20–23%** without
improving agent performance. Unnecessary requirements actively harm results by
broadening exploration. A lean file is 40–60 lines of commands and boundaries.

Confidence: **high** — the only threshold with a repository-scale measurement
behind it.

## `CLAUDE.md > 200 lines` — `budget.claude-md`

**Sources:** https://dev.to/nishilbhave/claudemd-best-practices-the-complete-2026-guide-435j ·
https://www.agentlint.app/blog/claude-md-best-practices-2026/

Frontier models reliably follow roughly **150–200 instructions**, and Claude
Code's own system prompt already spends about 50 of them. Past that the file is
skim-read rather than obeyed. Imports do not help — imported files load at
launch too, so splitting organises the text without reducing what competes for
attention.

Confidence: **medium-high** — consistent across sources, mechanism is plausible
and specific, but no controlled measurement like the AGENTS.md one.

## Skill descriptions > 16,000 bytes — `skill.description-budget`

**Source:** https://medium.com/@dan.avila7/claude-code-skills-progressive-disclosure-step-by-step-3ca02a4a9f60

At startup Claude Code loads only each skill's name and description — a few
dozen tokens each — while bodies stay on disk. Those descriptions share a
character budget of roughly **1–2% of the context window**. Install too many and
descriptions are **truncated**, losing the keywords Claude matches on.

16,000 bytes ≈ 4,000 tokens ≈ 2% of a 200k window. Configurable via
`thresholds.skillDescriptionBytes`.

Confidence: **medium**. The mechanism (a shared, truncating budget) is well
attested; the exact 1–2% figure comes from a single secondary source, not
official docs. The check is `info` for that reason.

This replaced a plain `skills > 30` count whose stated justification — "research
sweet spot is ~8–12 skills" — could not be sourced at all. The two disagree on
real data: kronstadt-ehs-2026 has 44 skills and sits under budget;
touchagency has 53 and is over.

## `MCP servers > 5` — `budget.mcp`

**Sources:** https://pub.towardsai.net/adding-more-mcp-tools-made-my-ai-agent-dumber-accuracy-collapses-past-20-8e754d09bee4 ·
https://albato.com/blog/publications/embedded-mcp-context-bloat-hallucinations

What degrades an agent is the number of **tool definitions** in context, not the
number of servers:

- ~20 tools: large models score 19/20 on selection
- ~46 tools: small (~8B) models fail
- ~107 tools: both large and small fail completely
- Berkeley Function Calling Leaderboard: showing 7 tools on average matched the
  coverage of showing 50 (90.3% vs 90.8%), and lifted Claude Sonnet's selection
  accuracy to 93.1% from 87.1%
- 5 servers × ~30 tools = 150 definitions ≈ 30k–60k tokens of metadata

Confidence in the threshold: **low as a measurement, adequate as a hint**.
agentscan cannot count tools without connecting to the servers, which would
break the no-network guarantee, so server count is a proxy and the rule's
`reason` says so.

## `.claude/agents` files > 8 — `budget.agents`

**Sources:** https://www.eesel.ai/blog/claude-code-multiple-agent-systems-complete-2026-guide ·
https://www.cloudzero.com/blog/claude-code-agents/

Guidance converges on **three or four** specialised agents being the productive
ceiling; beyond that output drops rather than rises. Multi-agent workflows cost
4–7x the tokens of a single session.

Confidence: **low-medium**. The research is about agents you *run concurrently*;
this counts *definitions on disk*, which is a different quantity. The proxy is
defensible — each definition's description is loaded so the main session can
choose between them — but it is a proxy. Fires on 0 of 17 projects measured.
