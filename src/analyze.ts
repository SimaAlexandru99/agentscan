import { resolve } from "node:path";
import { runChecks } from "./checks/index";
import { loadConfig } from "./config/load";
import type { AgentscanConfig } from "./config/schema";
import { resolveRoot } from "./discover/index";
import { extractFacts } from "./facts/extract";
import type { Facts, Finding } from "./facts/types";
import { sortFindings } from "./report/sort";

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

/**
 * The one definition of "what is wrong with this project".
 *
 * Every command that reports on a project goes through here — `explain`
 * silently missed every structural finding while it built its own pipeline.
 */
export function analyze(options: AnalyzeOptions = {}): Analysis {
  const requested = resolve(options.dir ?? process.cwd());
  const root = resolveRoot(requested);
  const loaded = loadConfig(root, options.configPath);

  const config: AgentscanConfig = {
    ...loaded,
    ...(options.failOn !== undefined ? { failOn: options.failOn } : {}),
    ...(options.global !== undefined ? { includeGlobal: options.global } : {}),
  };

  const includeGlobal = options.global ?? config.includeGlobal;
  const facts = extractFacts(root, config, { includeGlobal });

  const ignoredSkills = new Set(config.ignoreSkills);
  const ignoredRules = new Set(config.ignoreRules);

  const structural = runChecks(facts, {
    requireLock: config.requireLock,
    skillDescriptionBytes: config.thresholds.skillDescriptionBytes,
    budgets: {
      agentsMdLines: config.thresholds.agentsMdLines,
      claudeMdLines: config.thresholds.claudeMdLines,
      agents: config.thresholds.agents,
      mcp: config.thresholds.mcp,
    },
  }).filter(
    (f) =>
      !ignoredRules.has(f.ruleId) &&
      !(
        f.subject.startsWith("skill:") &&
        ignoredSkills.has(f.subject.slice("skill:".length))
      ),
  );

  // Suppression by exact finding id. Without it a single false positive costs
  // an entire check via ignoreRules — and under the README's CI recipe that is
  // the only way to get a build green again.
  const ignoredFindings = new Set(config.ignoreFindings);
  const findings = sortFindings(
    structural.filter((f) => !ignoredFindings.has(f.id)),
  );

  return {
    root,
    ...(root === requested ? {} : { resolvedFrom: requested }),
    config,
    facts,
    findings,
  };
}
