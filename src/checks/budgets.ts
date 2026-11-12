import { basename } from "node:path";
import { lineCount } from "../facts/text";
import type { Thresholds } from "../config/schema";
import type { Facts } from "../facts/types";
import type { Finding } from "../findings";
import { make } from "./make";
import type { RuleId } from "./registry";

type BudgetRuleId = Extract<RuleId, `budget.${string}`>;

type PolicyFile = Facts["policyFiles"][number];

/**
 * Budget checks: the config is well-formed, but there is too much of it.
 *
 * All of them are **info**. They are judgement calls about size, sourced to
 * docs/spec/thresholds.md, not defects — a project can sit over any of these
 * budgets deliberately. Nothing here should ever fail a build.
 */

/** First policy file with this basename that is over `limit`, if any. */
function overBudget(
  facts: Facts,
  file: string,
  limit: number,
): { policy: PolicyFile; lines: number } | null {
  for (const policy of facts.policyFiles) {
    if (basename(policy.path) !== file) {
      continue;
    }
    const lines = lineCount(policy.text);
    if (lines > limit) {
      return { policy, lines };
    }
  }
  return null;
}

function policyLengthFinding(args: {
  ruleId: BudgetRuleId;
  file: string;
  limit: number;
  facts: Facts;
  reason: string;
  suggest: string;
}): Finding[] {
  const hit = overBudget(args.facts, args.file, args.limit);
  if (hit === null) {
    return [];
  }
  return [
    make(args.ruleId, `rule:${args.ruleId}`, {
      message: `${args.file} is long (${hit.lines} lines > ${args.limit})`,
      reason: args.reason,
      evidence: [
        { kind: "policy", value: hit.policy.path },
        { kind: "count", value: `lines=${hit.lines}` },
        { kind: "threshold", value: String(args.limit) },
      ],
      suggest: args.suggest,
    }),
  ];
}

function countFinding(args: {
  ruleId: BudgetRuleId;
  count: number;
  limit: number;
  message: string;
  countLabel: string;
  reason: string;
  suggest: string;
}): Finding[] {
  if (args.count <= args.limit) {
    return [];
  }
  return [
    make(args.ruleId, `rule:${args.ruleId}`, {
      message: args.message,
      reason: args.reason,
      evidence: [
        { kind: "count", value: `${args.countLabel}=${args.count}` },
        { kind: "threshold", value: String(args.limit) },
      ],
      suggest: args.suggest,
    }),
  ];
}

/**
 * The package manager a policy file tells an agent to use, versus the one the
 * project actually declares. Narrow on purpose: it fires only on the exact
 * string `npm install` in a project whose `packageManager` is bun, because a
 * looser match would flag every doc that mentions npm in passing.
 */
export function runBudgets(facts: Facts, options: Thresholds): Finding[] {
  const claudeAgents = facts.agents.filter((agent) => agent.sourceProvider === "claude").length;
  return [
    ...policyLengthFinding({
      ruleId: "budget.agents-md",
      file: "AGENTS.md",
      limit: options.agentsMdLines,
      facts,
      suggest:
        "Delete rather than reorganise — keep only what an agent cannot infer from the code. Or set thresholds.agentsMdLines in .agentscanrc.json",
      reason:
        "Heuristic, not a published AGENTS.md requirement. Secondary measurements suggest diminishing returns past ~150 lines. Keep this at info; a long file is not a defect. See docs/spec/thresholds.md.",
    }),
    ...policyLengthFinding({
      ruleId: "budget.claude-md",
      file: "CLAUDE.md",
      limit: options.claudeMdLines,
      facts,
      suggest:
        "Keep only what is true every session; move the rest into a skill, which loads on demand. Or set thresholds.claudeMdLines in .agentscanrc.json",
      reason:
        "Claude Code's memory reference asks authors to target under 200 lines per CLAUDE.md — longer files consume more context and reduce adherence. See docs/spec/thresholds.md.",
    }),
    ...countFinding({
      ruleId: "budget.agents",
      count: claudeAgents,
      limit: options.agents,
      countLabel: "agents",
      message: `Agent roster large (${claudeAgents} > ${options.agents} definitions)`,
      reason:
        "Heuristic proxy, not a published requirement. Secondary write-ups converge on three or four specialised agents as a productive ceiling — that is about agents you run, not files on disk. This counts Claude definitions as a hint only. See docs/spec/thresholds.md.",
      suggest:
        "Archive definitions you do not dispatch, or set thresholds.agents in .agentscanrc.json",
    }),
    ...countFinding({
      ruleId: "budget.mcp",
      count: facts.mcp.length,
      limit: options.mcp,
      countLabel: "mcp",
      message: `MCP surface above sweet spot (${facts.mcp.length} > ${options.mcp})`,
      reason:
        "Heuristic proxy, not a published requirement. Tool-count research is about definitions in context, not server entries on disk, and this scanner cannot count live tools without opening a network connection. Treat the server count as a hint. See docs/spec/thresholds.md.",
      suggest:
        "Count the tools your servers actually expose; disable unused servers in mcp.json or set thresholds.mcp in .agentscanrc.json",
    }),
    ...codexInstructionBudget(facts),
  ];
}

function codexInstructionBudget(facts: Facts): Finding[] {
  const chain = facts.codexInstructionChain;
  if (chain.length === 0) {
    return [];
  }
  const limit = facts.codexProjectDocMaxBytes;
  const bytes = chain.reduce(
    (sum, policy) => sum + Buffer.byteLength(policy.text, "utf8"),
    0,
  );
  if (bytes <= limit) {
    return [];
  }
  return [
    make("codex.budget.instructions", "rule:codex.budget.instructions", {
      message: `Codex instruction chain exceeds ${limit} bytes (${bytes})`,
      reason:
        "Codex stops adding files once the combined size reaches project_doc_max_bytes (32 KiB by default). At most one file per directory is loaded — AGENTS.override.md if it is non-empty, otherwise AGENTS.md, otherwise the first non-empty project_doc_fallback_filenames entry. This is not applied to CLAUDE.md. See docs/spec/codex-agents-md.md.",
      evidence: [
        { kind: "count", value: `bytes=${bytes}` },
        { kind: "threshold", value: String(limit) },
        ...chain.map((policy) => ({ kind: "policy" as const, value: policy.path })),
      ],
      suggest: `Shorten the AGENTS.md chain or raise project_doc_max_bytes (currently ${limit})`,
    }),
  ];
}
