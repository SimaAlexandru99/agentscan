import { checkById } from "../../src/checks/lookup";
import type { Finding } from "../../src/facts/types";

/**
 * The provenance fields `make()` copies onto every finding.
 *
 * Real registry values when the id is a real rule, so a rendering test asserts
 * the line a user actually sees. Synthetic ids (`rule.x`, `r`) fall back to a
 * derived stand-in — they exist to exercise layout, not provenance.
 */
export function ruleMeta(
  ruleId: string,
): Pick<Finding, "provenance" | "source" | "lastVerified"> {
  const check = checkById(ruleId);
  if (check !== undefined) {
    return {
      provenance: check.provenance,
      source: check.source,
      lastVerified: check.lastVerified,
    };
  }
  return {
    provenance: "internal-consistency",
    source: { kind: "derived", detail: "test fixture" },
    lastVerified: "2026-09-03",
  };
}
