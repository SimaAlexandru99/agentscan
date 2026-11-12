import type { Facts } from "../facts/types";
import type { Finding } from "../findings";
import { runBudgets } from "./budgets";
import { checkAgents } from "./agents";
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
type CheckConfig = { requireLock?: boolean; thresholds: Thresholds };
export { STRUCTURAL_CHECKS } from "./registry";

/** Run every structural check. */
export function runChecks(
  facts: Facts,
  config: CheckConfig,
): Finding[] {
  return [
    ...checkConfigErrors(facts),
    ...checkHookEvents(facts),
    ...checkHooks(facts),
    ...checkSkillStructure(facts),
    ...checkLockIntegrity(facts, config.requireLock === true),
    ...checkDuplicateDescriptions(facts),
    ...checkDescriptionBudget(facts, config.thresholds),
    ...checkAgents(facts),
    ...checkMcp(facts),
    ...checkRules(facts),
    ...runBudgets(facts, config.thresholds),
  ];
}
