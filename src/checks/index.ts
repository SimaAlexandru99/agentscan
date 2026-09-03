import type { Facts, Finding } from "../facts/types";
import { runBudgets } from "./budgets";
import { checkAgents } from "./agents";
import { checkConfigErrors } from "./config";
import { checkHookEvents, checkHooks } from "./hooks";
import { checkMcp } from "./mcp";
import type { CheckOptions } from "./options";
import { checkRules } from "./rules";
import {
  checkDescriptionBudget,
  checkDuplicateDescriptions,
  checkLockIntegrity,
  checkSkillStructure,
} from "./skills";

export type { CheckOptions } from "./options";
export {
  COPILOT_HOOK_EVENTS,
  CURSOR_HOOK_EVENTS,
  GEMINI_HOOK_EVENTS,
  KNOWN_HOOK_EVENTS,
  VSCODE_HOOK_EVENTS,
} from "./hooks";
export { COMMANDCODE_HOOK_EVENTS } from "../facts/commandcode";
export { GROK_HOOK_EVENTS } from "../facts/grok";
export { STRUCTURAL_CHECKS } from "./registry";
export type { RuleProvenance, StructuralCheck } from "./provenance";
export { canonicalRuleId, canonicalizeFindingId, ignoreRuleSet, RULE_ALIASES } from "./aliases";

/**
 * Run every structural check. Order is deterministic; `check.ts` sorts anyway.
 */
export function runChecks(
  facts: Facts,
  options: CheckOptions = {},
): Finding[] {
  return [
    ...checkConfigErrors(facts),
    ...checkHookEvents(facts),
    ...checkHooks(facts),
    ...checkSkillStructure(facts),
    ...checkLockIntegrity(facts, options),
    ...checkDuplicateDescriptions(facts),
    ...checkDescriptionBudget(facts, options),
    ...checkAgents(facts),
    ...checkMcp(facts),
    ...checkRules(facts),
    ...(options.budgets === undefined
      ? []
      : runBudgets(facts, options.budgets)),
  ];
}
