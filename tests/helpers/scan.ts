import { analyze, type Analysis } from "../../src/analyze";
import type { Finding } from "../../src/findings";

/**
 * Scan `root` the way the CLI does. `startDir` names a deeper working
 * directory to scan from; the pinned root still bounds the walk.
 */
export function findingsFor(root: string, includeGlobal = false, startDir?: string): Analysis {
  return analyze({ dir: startDir ?? root, global: includeGlobal });
}

/** Findings after ignore filtering and the same sort the CLI reports. */
export function findings(root: string, includeGlobal = false, startDir?: string): Finding[] {
  return findingsFor(root, includeGlobal, startDir).findings;
}

export function ruleIds(root: string, includeGlobal = false, startDir?: string): string[] {
  return findings(root, includeGlobal, startDir).map((f) => f.ruleId);
}
