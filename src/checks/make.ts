import type { Finding, Severity } from "../findings";
import { checkById, type RuleId, type STRUCTURAL_CHECKS } from "./registry";

type RuleSeverity<R extends RuleId> = Extract<(typeof STRUCTURAL_CHECKS)[number], { id: R }>["severity"];

/**
 * A rule with one registry severity takes it from the registry; a rule that
 * lists several makes its call site choose one of them per finding.
 */
type SeverityArg<R extends RuleId> =
  RuleSeverity<R> extends readonly (infer S extends Severity)[] ? { severity: S } : { severity?: never };

/**
 * Build a finding.
 *
 * `id` is `${ruleId}:${subject}` — a public contract: it is what the report
 * prints under `--verbose` and in `--json`, what `agentscan explain` resolves,
 * and what `ignoreFindings` matches.
 * Provenance and default severity are attached here so every output carries
 * them. `ruleId` is typed against the registry; the throw is the runtime
 * backstop for ids a profile table builds from strings.
 */
export function make<R extends RuleId>(
  ruleId: R,
  subject: string,
  args: {
    /** Default `warn`; `add` only where the fix is to install something. */
    action?: Finding["action"];
    message: string;
    reason: string;
    evidence: Finding["evidence"];
    suggest?: string;
  } & SeverityArg<R>,
): Finding {
  const check = checkById(ruleId);
  if (check === undefined) {
    throw new Error(`no registry entry for rule ${ruleId} — add it to STRUCTURAL_CHECKS`);
  }
  const severity = args.severity ?? check.severity;
  if (typeof severity !== "string") {
    throw new Error(`rule ${ruleId} has several severities — the call site must pass one`);
  }
  const finding: Finding = {
    id: `${ruleId}:${subject}`,
    ruleId,
    action: args.action ?? "warn",
    severity,
    subject,
    message: args.message,
    reason: args.reason,
    evidence: args.evidence,
    provenance: check.provenance,
    source: check.source,
    lastVerified: check.lastVerified,
  };
  if (args.suggest !== undefined) {
    finding.suggest = args.suggest;
  }
  return finding;
}
