import { basename } from "node:path";
import type { Facts, Finding } from "../facts/types";
import { make } from "./make";

type PolicyFile = Facts["policyFiles"][number];

/**
 * Budget checks: the config is well-formed, but there is too much of it.
 *
 * These used to be five YAML files evaluated by a 581-line rule engine. Across
 * 21 real projects that engine produced 9 findings from 3 of its 5 rules, while
 * every actionable finding came from the structural checks next door. The
 * engine's one remaining job was letting users write their own rules — a
 * feature nobody had used, on a tool with no users, whose concrete case
 * (retuning a budget) `thresholds` in `.agentscanrc.json` already covered
 * without any YAML. It was deleted; see plans/010.
 *
 * Every finding these emit is byte-identical to what the rules produced,
 * including the `rule:` subjects, which is why the ids look the way they do.
 *
 * All of them are **info**. They are judgement calls about size, sourced to
 * docs/spec/thresholds.md, not defects — a project can sit over any of these
 * budgets deliberately. Nothing here should ever fail a build.
 */

type BudgetOptions = {
  agentsMdLines: number;
  claudeMdLines: number;
  agents: number;
  mcp: number;
};

/**
 * Lines the way `wc -l` counts them: a trailing newline terminates the last
 * line, it does not start another one.
 */
function lineCount(text: string): number {
  return text.length === 0 ? 0 : text.replace(/\r?\n$/, "").split(/\r?\n/).length;
}

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
  ruleId: string;
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
      action: "warn",
      severity: "info",
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
  ruleId: string;
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
      action: "warn",
      severity: "info",
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
export function runBudgets(facts: Facts, options: BudgetOptions): Finding[] {
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
      count: facts.agents.length,
      limit: options.agents,
      countLabel: "agents",
      message: `Agent roster large (${facts.agents.length} > ${options.agents} definitions)`,
      reason:
        "Guidance converges on three or four specialised agents being the productive ceiling — past that, output drops rather than rises. That is about agents you run, not files on disk, so this counts definitions as a proxy: each one's description is loaded so the main session can choose between them, and a long roster dilutes that choice the same way a long skill list does. See docs/spec/thresholds.md.",
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
        "What actually degrades an agent is the number of tool definitions in context, not the number of servers: benchmarks show large models near-perfect at ~20 tools and failing outright past ~100, and a typical server carries tens of tools. Server count is the only proxy available without connecting to them, so treat this as a hint to go count the tools, not as a measurement.",
      suggest:
        "Count the tools your servers actually expose; disable unused servers in mcp.json or set thresholds.mcp in .agentscanrc.json",
    }),
  ];
}
