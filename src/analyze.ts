import { join } from "node:path";
import { runChecks } from "./checks/index";
import { loadConfig } from "./config/load";
import type { SkillscanConfig } from "./config/schema";
import { resolveRoot } from "./discover/index";
import { extractFacts } from "./facts/extract";
import type { Facts, Finding } from "./facts/types";
import { sortFindings } from "./report/sort";
import { runRules } from "./rules/engine";
import { loadRules } from "./rules/load";
import type { RuleDefinition } from "./rules/schema";

export type AnalyzeOptions = {
  dir?: string;
  global?: boolean;
  configPath?: string;
  rulesDir?: string;
  failOn?: SkillscanConfig["failOn"];
};

export type Analysis = {
  root: string;
  config: SkillscanConfig;
  facts: Facts;
  rules: RuleDefinition[];
  findings: Finding[];
};

/**
 * The one definition of "what is wrong with this project".
 *
 * Both YAML rules and structural checks contribute findings, and every command
 * that reports on a project goes through here — `explain` silently missed every
 * structural finding while it built its own pipeline.
 */
export function analyze(options: AnalyzeOptions = {}): Analysis {
  const root = resolveRoot(options.dir ?? process.cwd());
  const loaded = loadConfig(root, options.configPath);

  const config: SkillscanConfig = {
    ...loaded,
    ...(options.failOn !== undefined ? { failOn: options.failOn } : {}),
    ...(options.global !== undefined ? { includeGlobal: options.global } : {}),
  };

  const includeGlobal = options.global ?? config.includeGlobal;
  const facts = extractFacts(root, config, { includeGlobal });

  const rules = loadRules({
    builtinDir: join(import.meta.dir, "rules/builtin"),
    userRulesDir: options.rulesDir ?? join(root, ".skillscan", "rules"),
    ignoreRules: config.ignoreRules,
  });

  const ignoredSkills = new Set(config.ignoreSkills);
  const ignoredRules = new Set(config.ignoreRules);

  const structural = runChecks(facts, {
    requireLock: config.requireLock,
  }).filter(
    (f) =>
      !ignoredRules.has(f.ruleId) &&
      !(
        f.subject.startsWith("skill:") &&
        ignoredSkills.has(f.subject.slice("skill:".length))
      ),
  );

  const findings = sortFindings([
    ...runRules(facts, rules, config),
    ...structural,
  ]);

  return { root, config, facts, rules, findings };
}
