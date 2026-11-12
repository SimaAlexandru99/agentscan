import type { RuleProvenance, RuleSource, Severity } from "../findings";

export type StructuralCheck = {
  id: string;
  description: string;
  severity: Severity | readonly Severity[];
  provenance: RuleProvenance;
  lastVerified: string;
  /**
   * Required, not optional. A new rule that cannot say where it came from
   * should not compile — that is the half of this contract a convention cannot
   * enforce.
   */
  source: RuleSource;
};

/** One severity, or the ones a call site picks between, e.g. `warning/error`. */
export function severityLabel(check: StructuralCheck): string {
  return typeof check.severity === "string" ? check.severity : check.severity.join("/");
}
