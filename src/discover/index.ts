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
  applyCommandcodeAgentPrecedence,
  applyCommandcodeHookPrecedence,
  applyCommandcodeMcpPrecedence,
  applyCommandcodeSkillPrecedence,
  commandcodeAgentsSkillsRoots,
  discoverCommandcodeCommands,
  discoverCommandcodeHooks,
  discoverCommandcodeInlineMcp,
  discoverCommandcodeMods,
  discoverCommandcodeUserMcp,
  isCommandcodeSkillsRel,
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
 * Command Code settings, skills, agents, commands, and path bases use
 * `commandcodeProjectRoot` (git root, or the working directory outside a git repo).
 */
export function discoverAgentSurface(
  root: string,
  config: AgentscanConfig,
  opts: {
    includeGlobal: boolean;
    onNestedDirectoryRead?: () => void;
    startDir?: string;
    scanBoundary?: string;
    commandcodeProjectRoot?: string;
  },
): AgentSurface {
  const startDir = opts.startDir ?? root;
  const scanBoundary = opts.scanBoundary ?? root;
  const commandcodeProjectRoot = opts.commandcodeProjectRoot ?? root;
  const dirs = ancestorDirsInclusive(startDir, scanBoundary);
  const configErrors: ConfigErrorFact[] = [];
  const skills: SkillFact[] = [];
  const configuredRoots = new Set<string>();
  for (const dir of dirs) {
    for (const rel of config.skillPaths) {
      if (isCommandcodeSkillsRel(rel)) {
        continue;
      }
      const abs = resolve(dir, rel);
      configuredRoots.add(abs);
      skills.push(...discoverSkillsInDir(abs, "project", configErrors, root));
    }
  }
  const commandcodeSkills = resolve(commandcodeProjectRoot, ".commandcode", "skills");
  if (!configuredRoots.has(commandcodeSkills)) {
    configuredRoots.add(commandcodeSkills);
    skills.push(...discoverSkillsInDir(commandcodeSkills, "project", configErrors, root));
  }
  skills.push(
    ...discoverNestedClaudeSkills(scanBoundary, configuredRoots, configErrors, {
      onDirectoryRead: opts.onNestedDirectoryRead,
    }),
  );

  const ccLayers = readCommandcodeSettingsLayers(
    commandcodeProjectRoot,
    configErrors,
    opts.includeGlobal,
  );
  const extraDirs: string[] = [];
  for (const declared of winningSkillsExtraDirs(ccLayers)) {
    const abs = resolve(resolveSkillLocation(commandcodeProjectRoot, declared));
    extraDirs.push(abs);
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

  const agentsSkillsRoots = commandcodeAgentsSkillsRoots(
    startDir,
    scanBoundary,
    homedir(),
  );
  applyCommandcodeSkillPrecedence(skills, {
    commandcodeProjectRoot,
    extraDirs,
    agentsSkillsRoots,
    includeGlobal: opts.includeGlobal,
  });

  const lock = discoverSkillsLocks(scanBoundary, root, configErrors);
  const agents = discoverAgents(
    scanBoundary,
    configErrors,
    startDir,
    opts.includeGlobal,
    commandcodeProjectRoot,
  );
  applyCommandcodeAgentPrecedence(agents, commandcodeProjectRoot);

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
  hooks.push(...discoverCommandcodeHooks(commandcodeProjectRoot, ccLayers, configErrors));
  for (const fact of discoverCommandcodeInlineMcp(commandcodeProjectRoot, ccLayers, configErrors)) {
    const key = mcpKey(fact);
    if (mcpSeen.has(key)) {
      continue;
    }
    mcpSeen.add(key);
    mcp.push(fact);
  }
  if (opts.includeGlobal) {
    for (const fact of discoverCommandcodeUserMcp(commandcodeProjectRoot, configErrors)) {
      const key = mcpKey(fact);
      if (mcpSeen.has(key)) {
        continue;
      }
      mcpSeen.add(key);
      mcp.push(fact);
    }
  }
  applyCommandcodeMcpPrecedence(mcp, commandcodeProjectRoot);
  const slashCommands = discoverCommandcodeCommands(
    commandcodeProjectRoot,
    opts.includeGlobal,
    configErrors,
  );
  const mods = discoverCommandcodeMods(ccLayers);
  const winningModel = winningCommandcodeModel(ccLayers);
  const allHooks = [
    ...hooks,
    ...skills.flatMap((s) => s.frontmatterHooks ?? []),
    ...agents.flatMap((a) => a.frontmatterHooks ?? []),
  ];
  applyCommandcodeHookPrecedence(allHooks);

  return {
    skills: disambiguateSkills(skills, root),
    agents,
    hooks: allHooks,
    mcp,
    policyFiles: discoverPolicyFiles(
      scanBoundary,
      config.policyFiles,
      configErrors,
      startDir,
      opts.includeGlobal,
      commandcodeProjectRoot,
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
    commandcodeProjectRoot,
  };
}
