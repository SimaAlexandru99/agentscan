import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { AgentscanConfig } from "../config/schema";
import type {
  ConfigErrorFact,
  SkillFact,
} from "../facts/types";
import { discoverAgents } from "./agents";
import { discoverHooks } from "./hooks";
import { discoverMcp } from "./mcp";
import { discoverPolicyFiles, discoverSkillsLock } from "./policy";
import {
  disambiguateSkills,
  discoverNestedClaudeSkills,
  discoverSkillsInDir,
} from "./skills";
import type { AgentSurface } from "./shared";

export type { AgentSurface } from "./shared";
export { hasAgentConfigSignal, resolveRoot } from "./shared";
export { hookScriptPath } from "./hooks";
export { discoverMcp, mcpCommandPath } from "./mcp";
export { skillReferences } from "./skills";

/**
 * Enumerate project (and optionally global) agent surface: skills, agents, hooks,
 * MCP, policy, lockfile. Config files that cannot be parsed are reported through
 * `configErrors` instead of being silently dropped.
 */
export function discoverAgentSurface(
  root: string,
  config: AgentscanConfig,
  opts: { includeGlobal: boolean; onNestedDirectoryRead?: () => void },
): AgentSurface {
  const configErrors: ConfigErrorFact[] = [];
  const skills: SkillFact[] = [];
  for (const rel of config.skillPaths) {
    skills.push(...discoverSkillsInDir(join(root, rel), "project", configErrors, root));
  }
  const configuredRoots = new Set(config.skillPaths.map((rel) => resolve(root, rel)));
  skills.push(
    ...discoverNestedClaudeSkills(root, configuredRoots, configErrors, {
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

  return {
    skills: disambiguateSkills(skills, root),
    agents: discoverAgents(root, configErrors),
    hooks: discoverHooks(root, configErrors),
    mcp: discoverMcp(root, config.mcpPaths, configErrors),
    policyFiles: discoverPolicyFiles(root, config.policyFiles, configErrors),
    lockedSkills: lock.locked,
    hasSkillsLock: lock.present,
    skillsLockInvalid: lock.invalid,
    configErrors,
  };
}
