import { join } from "node:path";
import { loadConfig } from "../config/load";
import type { SkillscanConfig } from "../config/schema";
import { resolveRoot } from "../discover/index";
import { extractFacts } from "../facts/extract";
import type { Finding } from "../facts/types";
import { runRules } from "../rules/engine";
import { loadRules } from "../rules/load";

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
  const root = resolveRoot(options.dir ?? process.cwd());
  const loaded = loadConfig(root, options.configPath);

  const config: SkillscanConfig = {
    ...loaded,
    ...(options.global !== undefined
      ? { includeGlobal: options.global }
      : {}),
  };

  const includeGlobal = options.global ?? config.includeGlobal;
  const facts = extractFacts(root, config, { includeGlobal });

  const builtinDir = join(import.meta.dir, "../rules/builtin");
  const userRulesDir =
    options.rulesDir ?? join(root, ".skillscan", "rules");
  const rules = loadRules({
    builtinDir,
    userRulesDir,
    ignoreRules: config.ignoreRules,
  });

  const findings = runRules(facts, rules, config);
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
  lines.push(`id: ${f.id}`);
  lines.push(`action: ${f.action}`);
  lines.push(`severity: ${f.severity}`);
  lines.push(`subject: ${f.subject}`);
  lines.push(`rule: ${f.ruleId}`);
  lines.push(`message: ${f.message}`);
  lines.push(`reason: ${f.reason}`);
  if (f.evidence.length > 0) {
    const ev = f.evidence.map((e) => `${e.kind} ${e.value}`).join(" · ");
    lines.push(`evidence: ${ev}`);
  }
  if (f.suggest !== undefined && f.suggest.length > 0) {
    lines.push(`suggest: ${f.suggest}`);
  }
  lines.push("");
  return lines.join("\n");
}
