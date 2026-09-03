import { analyze } from "../analyze";
import { canonicalizeFindingId } from "../checks/aliases";
import type { Finding } from "../facts/types";
import { provenanceLine } from "../report/provenance-line";
import { safe } from "../report/safe";

export type ExplainOptions = {
  dir?: string;
  global?: boolean;
  configPath?: string;
};

export type ExplainResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

/**
 * Re-run the check pipeline and print details for a finding by stable id.
 * Exit 1 if the finding is not found.
 */
export async function runExplain(
  findingId: string,
  options: ExplainOptions = {},
): Promise<ExplainResult> {
  const { findings } = analyze(options);
  const finding = findings.find(
    (f) => f.id === findingId || f.id === canonicalizeFindingId(findingId),
  );

  if (finding === undefined) {
    return {
      exitCode: 1,
      stdout: "",
      // The argument is echoed back, so it is untrusted like anything else.
      stderr: `Finding not found: ${safe(findingId)}\n`,
    };
  }

  return {
    exitCode: 0,
    stdout: formatExplain(finding),
    stderr: "",
  };
}

function formatExplain(f: Finding): string {
  const lines: string[] = [];
  lines.push(`id: ${safe(f.id)}`);
  lines.push(`action: ${f.action}`);
  lines.push(`severity: ${f.severity}`);
  lines.push(`subject: ${safe(f.subject)}`);
  lines.push(`rule: ${safe(f.ruleId)}`);
  lines.push(`provenance: ${safe(provenanceLine(f))}`);
  if (f.source.kind === "spec") {
    // The full URL, not the shortened form the report prints, plus the capture
    // holding the verbatim quote — this is the surface a reader uses to check
    // the claim rather than take it.
    lines.push(`source: ${safe(f.source.url)}`);
    lines.push(`capture: docs/spec/${safe(f.source.capture)}`);
  }
  lines.push(`message: ${safe(f.message)}`);
  lines.push(`reason: ${safe(f.reason)}`);
  if (f.evidence.length > 0) {
    const ev = f.evidence
      .map((e) => `${safe(e.kind)} ${safe(e.value)}`)
      .join(" · ");
    lines.push(`evidence: ${ev}`);
  }
  if (f.suggest !== undefined && f.suggest.length > 0) {
    lines.push(`suggest: ${safe(f.suggest)}`);
  }
  lines.push("");
  return lines.join("\n");
}
