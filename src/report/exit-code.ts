import type { FailOn } from "../config/schema";
import type { Finding } from "../findings";
import { summarize } from "./summary";

/**
 * - never → always 0
 * - warning → 1 if any finding with severity warning|error
 * - error → 1 if any finding with severity error
 */
export function exitCode(
  findings: Finding[],
  failOn: FailOn,
  failUnder?: number,
): 0 | 1 {
  const summary = summarize(findings, { verbose: true });
  if (failUnder !== undefined && summary.score < failUnder) {
    return 1;
  }
  const gated = failOn === "error" ? summary.counts.error : failOn === "warning" ? summary.actionable.length : 0;
  return gated > 0 ? 1 : 0;
}
