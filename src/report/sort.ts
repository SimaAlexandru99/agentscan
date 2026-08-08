import type { Action, Finding, Severity } from "../facts/types";

const SEVERITY_RANK: Record<Severity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

/** Deterministic: severity error>warning>info, then action, then id */
export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const sev = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (sev !== 0) {
      return sev;
    }
    const act = compareAction(a.action, b.action);
    if (act !== 0) {
      return act;
    }
    return a.id.localeCompare(b.id);
  });
}

function compareAction(a: Action, b: Action): number {
  return a.localeCompare(b);
}
