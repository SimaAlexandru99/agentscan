import { join } from "node:path";
import { loadConfig } from "../config/load";
import type { SkillscanConfig } from "../config/schema";
import { resolveRoot } from "../discover/index";
import { extractFacts } from "../facts/extract";
import { exitCode, type FailOn } from "../report/exit-code";
import { renderJson } from "../report/json";
import { sortFindings } from "../report/sort";
import { renderText } from "../report/text";
import { runRules } from "../rules/engine";
import { loadRules } from "../rules/load";
import { VERSION } from "../version";

export type CheckOptions = {
  dir?: string;
  json?: boolean;
  quiet?: boolean;
  verbose?: boolean;
  failOn?: FailOn;
  global?: boolean;
  configPath?: string;
  rulesDir?: string;
};

export type CheckResult = {
  exitCode: number;
  stdout: string;
};

/**
 * Run the full check pipeline (discover → facts → rules → report).
 * Returns exit code + stdout for testability; CLI prints and process.exit.
 */
export async function runCheck(options: CheckOptions): Promise<CheckResult> {
  const root = resolveRoot(options.dir ?? process.cwd());
  const loaded = loadConfig(root, options.configPath);

  const config: SkillscanConfig = {
    ...loaded,
    ...(options.failOn !== undefined ? { failOn: options.failOn } : {}),
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

  const findings = sortFindings(runRules(facts, rules, config));

  const stdout = options.json
    ? renderJson({ version: VERSION, root, facts, findings })
    : renderText({
        version: VERSION,
        facts,
        findings,
        verbose: options.verbose ?? false,
        quiet: options.quiet ?? false,
      });

  return {
    exitCode: exitCode(findings, config.failOn),
    stdout,
  };
}
