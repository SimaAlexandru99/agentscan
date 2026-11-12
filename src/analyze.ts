import { resolve } from "node:path";
import { ignoreRuleSet } from "./checks/registry";
import { runChecks } from "./checks/index";
import { loadConfig } from "./config/load";
import type { AgentscanConfig } from "./config/schema";
import { extractFacts } from "./discover/extract";
import { resolveScanContext, type ScanLocation } from "./discover/scan-context";
import type { Facts } from "./facts/types";
import { sortFindings, type Finding } from "./findings";

export type AnalyzeOptions = {
  dir?: string;
  global?: boolean;
  configPath?: string;
  failOn?: AgentscanConfig["failOn"];
};

export type Analysis = {
  root: string;
  /** Set only when the requested directory was not itself the project root. */
  resolvedFrom?: string;
  config: AgentscanConfig;
  facts: Facts;
  findings: Finding[];
};

export type Project = {
  root: string;
  /** Set only when the requested directory was not itself the project root. */
  resolvedFrom?: string;
  location: ScanLocation;
  config: AgentscanConfig;
};

/**
 * Root resolution, config load and the CLI overrides, decided once. `rules`
 * needs only this; `analyze` builds on it.
 */
export function loadProject(options: AnalyzeOptions = {}): Project {
  const requested = resolve(options.dir ?? process.cwd());
  const location = resolveScanContext(requested);
  const root = location.root;
  const loaded = loadConfig(root, options.configPath);
  const config: AgentscanConfig = {
    ...loaded,
    ...(options.failOn !== undefined ? { failOn: options.failOn } : {}),
    ...(options.global !== undefined ? { includeGlobal: options.global } : {}),
  };
  return {
    root,
    ...(root === requested ? {} : { resolvedFrom: requested }),
    location,
    config,
  };
}

/**
 * The one definition of "what is wrong with this project".
 *
 * Every command that reports on a project goes through here.
 */
export function analyze(options: AnalyzeOptions = {}): Analysis {
  const { location, ...project } = loadProject(options);
  const { config } = project;
  const facts = extractFacts(location, config);

  const ignoredSkills = new Set(config.ignoreSkills);
  const ignoredRules = ignoreRuleSet(config.ignoreRules);

  const structural = runChecks(facts, config).filter(
    (f) =>
      !ignoredRules.has(f.ruleId) &&
      !(
        f.subject.startsWith("skill:") &&
        ignoredSkills.has(f.subject.slice("skill:".length).split("@", 1)[0] ?? "")
      ),
  );

  // Exact finding ids, so one false positive need not disable a whole rule.
  const ignoredFindings = new Set(config.ignoreFindings);
  const findings = sortFindings(
    structural.filter((f) => !ignoredFindings.has(f.id)),
  );

  return { ...project, facts, findings };
}
