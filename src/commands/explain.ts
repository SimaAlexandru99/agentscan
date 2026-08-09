import { analyze } from "../analyze";
import type { Finding } from "../facts/types";
import { safe } from "../report/safe";

export type ExplainOptions = {
  dir?: string;
  global?: boolean;
  configPath?: string;
  rulesDir?: string;
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
  const finding = findings.find((f) => f.id === findingId);

  if (finding === undefined) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `Finding not found: ${findingId}\n`,
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
