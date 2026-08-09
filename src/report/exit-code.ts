import type { Finding } from "../facts/types";
import { score } from "./score";

export type FailOn = "never" | "warning" | "error";

/**
 * - never → always 0
 * - warning → 1 if any non-keep finding with severity warning|error
 * - error → 1 if any finding with severity error
 */
export function exitCode(
  findings: Finding[],
  failOn: FailOn,
  failUnder?: number,
): 0 | 1 {
  // A score floor and a severity gate answer different questions, so either
  // can fail the run on its own.
  if (failUnder !== undefined && score(findings) < failUnder) {
    return 1;
  }
  if (failOn === "never") {
    return 0;
  }

  if (failOn === "error") {
    return findings.some((f) => f.severity === "error") ? 1 : 0;
  }

  // warning threshold: warning or error, excluding keep
  const hits = findings.some(
    (f) =>
      f.action !== "keep" &&
      (f.severity === "warning" || f.severity === "error"),
  );
  return hits ? 1 : 0;
}
