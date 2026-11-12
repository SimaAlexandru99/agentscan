/**
 * What a check reports. Kept out of `facts/` so the data layer describes
 * the scanned project only and never depends on the checks that read it.
 */

export type Action = "add" | "warn";
export type Severity = "error" | "warning" | "info";

export type RuleProvenance =
  | "spec-required"
  | "vendor-recommendation"
  | "security"
  | "internal-consistency"
  | "heuristic";

/**
 * Where a rule's assertion comes from, in a form the CLI can show a user.
 *
 * The evidence discipline behind these checks lived only in `docs/spec/`, which
 * the npm package does not ship — so a reader could not tell a line quoted from
 * a vendor page from an inference of our own. Both render as `error`.
 *
 * `spec` names the page and the capture file holding the verbatim quote;
 * `docs/spec` is on GitHub, so `capture` is a reader's shortest path to the
 * quoted lines. `derived` is the honest alternative: there is no vendor page,
 * and the phrase says what the rule actually rests on. Never dress an inference
 * or a blog measurement up as a spec — `budget.agents-md` is `derived` for
 * exactly that reason.
 */
export type RuleSource =
  | { kind: "spec"; url: string; capture: string }
  | { kind: "derived"; detail: string };

/** Evidence that is a measurement, not a place: the text report keeps it off the location line. */
export type MetricEvidenceKind = "count" | "threshold";
export type LocationEvidenceKind =
  | "agent"
  | "command"
  | "config"
  | "detail"
  | "env"
  | "field"
  | "hook"
  | "known"
  | "lock"
  | "lockfile"
  | "mcp"
  | "missing"
  | "policy"
  | "rule"
  | "script"
  | "shape"
  | "skill"
  | "source"
  | "timeout";
export type Evidence = { kind: MetricEvidenceKind | LocationEvidenceKind; value: string };

export function isMetricEvidence(e: Evidence): boolean {
  return e.kind === "count" || e.kind === "threshold";
}

export type Finding = {
  id: string; // stable: `${ruleId}:${subject}`
  ruleId: string;
  action: Action;
  severity: Severity;
  subject: string; // e.g. skill:next-cache-components
  message: string;
  reason: string;
  evidence: Evidence[];
  suggest?: string;
  /**
   * Copied from the rule's registry entry by `make()`. Carried on the finding
   * rather than looked up per renderer so that a finding piped anywhere — the
   * prompt handoff, a `--json` consumer, one line of a report — still says
   * where its assertion comes from.
   */
  provenance: RuleProvenance;
  source: RuleSource;
  lastVerified: string;
};

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
    const act = a.action.localeCompare(b.action);
    if (act !== 0) {
      return act;
    }
    return a.id.localeCompare(b.id);
  });
}
