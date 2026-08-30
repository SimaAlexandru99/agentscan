import { basename, dirname, resolve } from "node:path";
import type { Facts, Finding } from "../facts/types";
import { make } from "./make";

const CODEX_PROJECT_DOC_MAX_BYTES = 32_768;

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
  const claudeAgents = facts.agents.filter(
    (agent) => agent.sourceProvider === undefined || agent.sourceProvider === "claude",
  ).length;
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

/**
 * Codex concatenates AGENTS.md / AGENTS.override.md from the project root
 * down to cwd and stops at `project_doc_max_bytes` (32 KiB). Nested files
 * that are not on that walk-up chain are not counted. CLAUDE.md is excluded.
 * See docs/spec/codex-agents-md.md.
 */
function isAgentsMdPolicy(policy: PolicyFile): boolean {
  if (policy.kind === "agents-md") {
    return true;
  }
  if (policy.kind !== undefined) {
    return false;
  }
  const name = basename(policy.path);
  return name === "AGENTS.md" || name === "AGENTS.override.md";
}

function nonempty(text: string): boolean {
  return text.trim().length > 0;
}

/**
 * Per directory Codex loads at most one file: non-empty AGENTS.override.md,
 * otherwise AGENTS.md. Empty files are skipped. See docs/spec/codex-agents-md.md.
 */
export function effectiveCodexInstructionChain(files: PolicyFile[]): PolicyFile[] {
  const onChain = files.filter((policy) => {
    if (!isAgentsMdPolicy(policy)) {
      return false;
    }
    return policy.hopsFromStart !== undefined && Number.isFinite(policy.hopsFromStart);
  });
  const byDir = new Map<string, PolicyFile[]>();
  for (const policy of onChain) {
    const dir = resolve(dirname(policy.path));
    const bucket = byDir.get(dir);
    if (bucket === undefined) {
      byDir.set(dir, [policy]);
    } else {
      bucket.push(policy);
    }
  }
  const effective: PolicyFile[] = [];
  for (const group of byDir.values()) {
    const override = group.find((policy) => basename(policy.path) === "AGENTS.override.md");
    const normal = group.find((policy) => basename(policy.path) === "AGENTS.md");
    const pick =
      override !== undefined && nonempty(override.text)
        ? override
        : normal !== undefined && nonempty(normal.text)
          ? normal
          : undefined;
    if (pick !== undefined) {
      effective.push(pick);
    }
  }
  return effective;
}

function codexInstructionBudget(facts: Facts): Finding[] {
  const chain = effectiveCodexInstructionChain(facts.policyFiles);
  if (chain.length === 0) {
    return [];
  }
  const limit = facts.codexProjectDocMaxBytes ?? CODEX_PROJECT_DOC_MAX_BYTES;
  const bytes = chain.reduce(
    (sum, policy) => sum + Buffer.byteLength(policy.text, "utf8"),
    0,
  );
  if (bytes <= limit) {
    return [];
  }
  return [
    make("codex.budget.instructions", "rule:codex.budget.instructions", {
      action: "warn",
      severity: "info",
      message: `Codex instruction chain exceeds ${limit} bytes (${bytes})`,
      reason:
        "Codex stops adding AGENTS.md files once the combined size reaches project_doc_max_bytes (32 KiB by default). At most one file per directory is loaded — AGENTS.override.md if it is non-empty, otherwise AGENTS.md. This is not applied to CLAUDE.md. See docs/spec/codex-agents-md.md.",
      evidence: [
        { kind: "count", value: `bytes=${bytes}` },
        { kind: "threshold", value: String(limit) },
        ...chain.map((policy) => ({ kind: "policy", value: policy.path })),
      ],
      suggest:
        "Shorten AGENTS.md files on the path from the project root to the working directory, or raise project_doc_max_bytes in .codex/config.toml",
    }),
  ];
}
