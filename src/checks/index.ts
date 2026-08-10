import type { Facts, Finding } from "../facts/types";
import { runBudgets } from "./budgets";
import { checkAgents } from "./agents";
import { checkConfigErrors } from "./config";
import { checkHookEvents, checkHooks } from "./hooks";
import { checkMcp } from "./mcp";
import type { CheckOptions } from "./options";
import {
  checkDescriptionBudget,
  checkDuplicateDescriptions,
  checkLockIntegrity,
  checkSkillStructure,
} from "./skills";

export type { CheckOptions } from "./options";
export { KNOWN_HOOK_EVENTS } from "./hooks";
export { STRUCTURAL_CHECKS } from "./registry";

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
    ...(options.budgets === undefined
      ? []
      : runBudgets(facts, options.budgets)),
  ];
}
