import type { Finding } from "../facts/types";
import { checkById } from "./lookup";

/**
 * Build a finding.
 *
 * `id` is `${ruleId}:${subject}` — a public contract: it is what the report
 * prints under `--verbose` and in `--json`, what `agentscan explain` resolves,
 * and what `ignoreFindings` matches.
 * Both structural checks and budget checks go through here so there is one
 * place that decides the shape.
 *
 * Provenance is attached here rather than at render time because this is the
 * one place every finding passes through: the human report, `explain`, `--json`
 * and the prompt handoff then all carry it without four separate lookups. The
 * throw is safe because `tests/unit/checks.test.ts` asserts declared ids and
 * emitted ids are the same set — and a finding that cannot account for itself
 * is exactly what this was added to abolish.
 */
export function make(
  ruleId: string,
  subject: string,
  args: {
    action: Finding["action"];
    severity: Finding["severity"];
    message: string;
    reason: string;
    evidence: Finding["evidence"];
    suggest?: string;
  },
): Finding {
  const check = checkById(ruleId);
  if (check === undefined) {
    throw new Error(`no registry entry for rule ${ruleId} — add it to STRUCTURAL_CHECKS`);
  }
  const finding: Finding = {
    id: `${ruleId}:${subject}`,
    ruleId,
    action: args.action,
    severity: args.severity,
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
