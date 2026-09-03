import { canonicalRuleId } from "./aliases";
import type { StructuralCheck } from "./provenance";
import { STRUCTURAL_CHECKS } from "./registry";

/**
 * Rule id to its registry entry.
 *
 * Built once. `make()` calls this for every finding, and a linear scan of 112
 * entries per finding is a cost with no reason to exist.
 */
const BY_ID: Map<string, StructuralCheck> = new Map(
  STRUCTURAL_CHECKS.map((check) => [check.id, check]),
);

/**
 * `Finding.ruleId` is always canonical, so a lookup on it needs no aliasing —
 * but a user-supplied id (`explain`, `ignoreRules`) may still be a legacy
 * spelling, and both callers reach this function.
 */
export function checkById(ruleId: string): StructuralCheck | undefined {
  return BY_ID.get(ruleId) ?? BY_ID.get(canonicalRuleId(ruleId));
}
