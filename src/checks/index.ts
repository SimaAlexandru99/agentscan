import { toPosix } from "../facts/paths";
import type { Facts } from "../facts/types";
import type { Finding } from "../findings";
import { runBudgets } from "./budgets";
import { checkAgents } from "./agents";
import { checkClaudeDesktopExtensions } from "./claude-desktop";
import { checkConfigErrors } from "./config";
import { checkHookEvents, checkHooks } from "./hooks";
import { checkMcp } from "./mcp";
import type { Thresholds } from "../config/schema";
import { checkRules } from "./rules";
import {
  checkDescriptionBudget,
  checkDuplicateDescriptions,
  checkLockIntegrity,
  checkSkillStructure,
} from "./skills";

/** The config keys checks read, passed through as loaded. */
type CheckConfig = { requireLock?: boolean; includeGlobal?: boolean; thresholds: Thresholds };

/**
 * Installed plugin copies and backups under home. A `--global` scan of home
 * walks into them, and their bundled Windsurf rules, agents, MCP servers and
 * oversized files are vendor copies the user never loads as their own config.
 */
const GLOBAL_COPY_TREES = [
  "/.claude/plugins/cache/",
  "/.claude/plugins/marketplaces/",
  "/.claude-backups/",
  "/.codex/plugins/",
  "/.grok/installed-plugins/",
  "/.cursor/plugins/",
];

function inGlobalCopyTree(path: string): boolean {
  const posix = toPosix(path);
  return GLOBAL_COPY_TREES.some((tree) => posix.includes(tree));
}

/** Facts for the checks that count or flag copies: windsurf rules, budget.*, scan.truncated. */
function withoutGlobalCopies(facts: Facts): Facts {
  return {
    ...facts,
    rules: facts.rules?.filter((r) => r.sourceProvider !== "windsurf" || !inGlobalCopyTree(r.path)),
    agents: facts.agents.filter((a) => !inGlobalCopyTree(a.path)),
    mcp: facts.mcp.filter((m) => !inGlobalCopyTree(m.path)),
    configErrors: facts.configErrors.filter((e) => e.kind !== "truncated" || !inGlobalCopyTree(e.path)),
  };
}
export { STRUCTURAL_CHECKS } from "./registry";

/** Run every structural check. */
export function runChecks(
  facts: Facts,
  config: CheckConfig,
): Finding[] {
  const quiet = config.includeGlobal === true ? withoutGlobalCopies(facts) : facts;
  return [
    ...checkConfigErrors(quiet),
    ...checkHookEvents(facts),
    ...checkHooks(facts),
    ...checkSkillStructure(facts),
    ...checkLockIntegrity(facts, config.requireLock === true),
    ...checkDuplicateDescriptions(facts),
    ...checkDescriptionBudget(facts, config.thresholds),
    ...checkAgents(facts),
    ...checkMcp(facts),
    ...checkClaudeDesktopExtensions(facts),
    ...checkRules(quiet),
    ...runBudgets(quiet, config.thresholds),
  ];
}
