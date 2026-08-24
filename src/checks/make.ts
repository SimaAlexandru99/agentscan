import type { Finding } from "../facts/types";

/**
 * Build a finding.
 *
 * `id` is `${ruleId}:${subject}` — a public contract: it is what the report
 * prints under `--verbose` and in `--json`, what `agentscan explain` resolves,
 * and what `ignoreFindings` matches.
 * Both structural checks and budget checks go through here so there is one
 * place that decides the shape.
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
  const finding: Finding = {
    id: `${ruleId}:${subject}`,
    ruleId,
    action: args.action,
    severity: args.severity,
    subject,
    message: args.message,
    reason: args.reason,
    evidence: args.evidence,
  };
  if (args.suggest !== undefined) {
    finding.suggest = args.suggest;
  }
  return finding;
}
