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
import {
  discoverCommandcodeCommands,
  discoverCommandcodeHooks,
  discoverCommandcodeInlineMcp,
  discoverCommandcodeMods,
  discoverCommandcodeUserMcp,
  readCommandcodeSettingsLayers,
  resolveSkillLocation,
  winningCommandcodeModel,
  winningSkillsExtraDirs,
} from "./commandcode";
import { discoverHooks, discoverVscodeHooks } from "./hooks";
import { discoverMcpSurface, discoverNestedContinueMcp } from "./mcp";
import { discoverPluginHooks } from "./plugins";
import { discoverPolicyFiles, discoverSkillsLocks } from "./policy";
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

  const ccLayers = readCommandcodeSettingsLayers(root, configErrors, opts.includeGlobal);
  for (const declared of winningSkillsExtraDirs(ccLayers)) {
    const abs = resolve(resolveSkillLocation(root, declared));
    if (configuredRoots.has(abs)) {
      continue;
    }
    configuredRoots.add(abs);
    const homeRoot = resolve(homedir());
    const source = abs === homeRoot || abs.startsWith(`${homeRoot}/`) ? "global" : "project";
    const extra = discoverSkillsInDir(abs, source, configErrors, root);
    skills.push(
      ...extra.map((skill) =>
        skill.schemaProfile === "agent-skills"
          ? skill
          : { ...skill, schemaProfile: "agent-skills" as const },
      ),
    );
  }

  if (opts.includeGlobal) {
    const home = homedir();
    const globalSkillDirs = [
      join(home, ".claude", "skills"),
      join(home, ".codex", "skills"),
      join(home, ".commandcode", "skills"),
      join(home, ".agents", "skills"),
    ];
    for (const abs of globalSkillDirs) {
      const resolved = resolve(abs);
      if (configuredRoots.has(resolved)) {
        continue;
      }
      configuredRoots.add(resolved);
      skills.push(...discoverSkillsInDir(abs, "global", configErrors, root));
    }
  }

  const lock = discoverSkillsLocks(scanBoundary, root, configErrors);
  const agents = discoverAgents(scanBoundary, configErrors, startDir, opts.includeGlobal);

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
  hooks.push(...discoverCommandcodeHooks(root, ccLayers, configErrors));
  for (const fact of discoverCommandcodeInlineMcp(root, ccLayers, configErrors)) {
    const key = mcpKey(fact);
    if (mcpSeen.has(key)) {
      continue;
    }
    mcpSeen.add(key);
    mcp.push(fact);
  }
  if (opts.includeGlobal) {
    for (const fact of discoverCommandcodeUserMcp(root, configErrors)) {
      const key = mcpKey(fact);
      if (mcpSeen.has(key)) {
        continue;
      }
      mcpSeen.add(key);
      mcp.push(fact);
    }
  }
  const slashCommands = discoverCommandcodeCommands(
    scanBoundary,
    opts.includeGlobal,
    configErrors,
    startDir,
  );
  const mods = discoverCommandcodeMods(ccLayers);
  const winningModel = winningCommandcodeModel(ccLayers);

  return {
    skills: disambiguateSkills(skills, root),
    agents,
    hooks: [
      ...hooks,
      ...skills.flatMap((s) => s.frontmatterHooks ?? []),
      ...agents.flatMap((a) => a.frontmatterHooks ?? []),
    ],
    mcp,
    policyFiles: discoverPolicyFiles(
      scanBoundary,
      config.policyFiles,
      configErrors,
      startDir,
      opts.includeGlobal,
    ),
    rules,
    lockedSkills: lock.locked,
    hasSkillsLock: lock.present,
    skillsLockInvalid: lock.invalid,
    ...(lock.lockRoots.length === 0 ? {} : { skillLockRoots: lock.lockRoots }),
    configErrors,
    ...(codexProjectDocMaxBytes === undefined ? {} : { codexProjectDocMaxBytes }),
    ...(slashCommands.length === 0 ? {} : { slashCommands }),
    ...(mods.length === 0 ? {} : { mods }),
    ...(winningModel === undefined
      ? {}
      : { commandcodeModel: winningModel.model, commandcodeModelSource: winningModel.source }),
  };
}
