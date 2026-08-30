import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { AgentscanConfig } from "../config/schema";
import type {
  ConfigErrorFact,
  HookFact,
  McpFact,
  RuleFact,
  SkillFact,
} from "../facts/types";
import { discoverAgents } from "./agents";
import { discoverHooks, discoverVscodeHooks } from "./hooks";
import { discoverMcpSurface, discoverNestedContinueMcp } from "./mcp";
import { discoverPluginHooks } from "./plugins";
import { discoverPolicyFiles, discoverSkillsLock } from "./policy";
import { discoverRules } from "./rules";
import {
  disambiguateSkills,
  discoverNestedClaudeSkills,
  discoverSkillsInDir,
} from "./skills";
import { ancestorDirsInclusive, type AgentSurface } from "./shared";

export type { AgentSurface } from "./shared";
export { hasAgentConfigSignal, resolveRoot, resolveScanContext } from "./shared";
export { hookScriptPath } from "./hooks";
export { discoverMcp, mcpCommandPath } from "./mcp";
export { skillReferences } from "./skills";

function mcpKey(fact: McpFact): string {
  return `${fact.name}@${fact.path}${fact.platform === undefined ? "" : `:${fact.platform}`}`;
}

/**
 * Enumerate project (and optionally global) agent surface: skills, agents, hooks,
 * MCP, policy, lockfile. Config files that cannot be parsed are reported through
 * `configErrors` instead of being silently dropped.
 *
 * `root` is the display / package root. `scanBoundary` is the farthest ancestor
 * discovery may walk — a child `.cursor` must not hide parent Claude or Codex.
 */
export function discoverAgentSurface(
  root: string,
  config: AgentscanConfig,
  opts: {
    includeGlobal: boolean;
    onNestedDirectoryRead?: () => void;
    startDir?: string;
    scanBoundary?: string;
  },
): AgentSurface {
  const startDir = opts.startDir ?? root;
  const scanBoundary = opts.scanBoundary ?? root;
  const dirs = ancestorDirsInclusive(startDir, scanBoundary);
  const configErrors: ConfigErrorFact[] = [];
  const skills: SkillFact[] = [];
  const configuredRoots = new Set<string>();
  for (const dir of dirs) {
    for (const rel of config.skillPaths) {
      const abs = resolve(dir, rel);
      configuredRoots.add(abs);
      skills.push(...discoverSkillsInDir(abs, "project", configErrors, root));
    }
  }
  skills.push(
    ...discoverNestedClaudeSkills(scanBoundary, configuredRoots, configErrors, {
      onDirectoryRead: opts.onNestedDirectoryRead,
    }),
  );

  if (opts.includeGlobal) {
    const home = homedir();
    skills.push(
      ...discoverSkillsInDir(join(home, ".claude", "skills"), "global", configErrors, root),
    );
    skills.push(
      ...discoverSkillsInDir(join(home, ".codex", "skills"), "global", configErrors, root),
    );
  }

  const lock = discoverSkillsLock(root, configErrors);
  const agents = discoverAgents(scanBoundary, configErrors, startDir);

  const hooks: HookFact[] = [];
  const mcp: McpFact[] = [];
  const mcpSeen = new Set<string>();
  const rules: RuleFact[] = [];
  let codexProjectDocMaxBytes: number | undefined;
  for (const dir of dirs) {
    hooks.push(...discoverHooks(dir, configErrors));
    hooks.push(...discoverVscodeHooks(dir, configErrors));
    const discovered = discoverMcpSurface(dir, config.mcpPaths, configErrors);
    if (discovered.codexProjectDocMaxBytes !== undefined && codexProjectDocMaxBytes === undefined) {
      codexProjectDocMaxBytes = discovered.codexProjectDocMaxBytes;
    }
    for (const fact of discovered.facts) {
      const key = mcpKey(fact);
      if (mcpSeen.has(key)) {
        continue;
      }
      mcpSeen.add(key);
      mcp.push(fact);
    }
    rules.push(...discoverRules(dir, configErrors));
  }
  mcp.push(...discoverNestedContinueMcp(scanBoundary, configErrors, mcpSeen));
  hooks.push(...discoverPluginHooks(scanBoundary, configErrors));

  return {
    skills: disambiguateSkills(skills, root),
    agents,
    hooks: [
      ...hooks,
      ...skills.flatMap((s) => s.frontmatterHooks ?? []),
      ...agents.flatMap((a) => a.frontmatterHooks ?? []),
    ],
    mcp,
    policyFiles: discoverPolicyFiles(scanBoundary, config.policyFiles, configErrors, startDir),
    rules,
    lockedSkills: lock.locked,
    hasSkillsLock: lock.present,
    skillsLockInvalid: lock.invalid,
    configErrors,
    ...(codexProjectDocMaxBytes === undefined ? {} : { codexProjectDocMaxBytes }),
  };
}
