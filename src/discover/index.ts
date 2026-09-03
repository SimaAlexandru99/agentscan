import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { AgentscanConfig } from "../config/schema";
import { claudeConfigDir } from "../facts/claude";
import { grokHomeDir } from "../facts/grok";
import type {
  ConfigErrorFact,
  HookFact,
  McpFact,
  RuleFact,
  SkillFact,
} from "../facts/types";
import { discoverAgents } from "./agents";
import { discoverClaudeCommands } from "./claude";
import { discoverCodexUserMcp } from "./codex";
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
import { discoverCursorHooksFile } from "./cursor";
import { applyGrokMcpPrecedence, discoverGrokUserMcp } from "./grok";
import {
  discoverClaudeUserHooks,
  discoverCopilotSettingsHooks,
  discoverCopilotUserHooks,
  discoverCopilotUserSettingsHooks,
  discoverGeminiHooks,
  discoverGrokHooks,
  discoverHooks,
  discoverVscodeHooks,
} from "./hooks";
import { discoverClaudeUserMcp, discoverMcpSurface, discoverNestedContinueMcp } from "./mcp";
import { discoverPluginHooks, discoverPluginSurfaces, findPluginRoots } from "./plugins";
import { discoverPolicyFiles, discoverSkillsLocks, resolveCodexProjectRoot } from "./policy";
import { discoverClaudeUserRules, discoverNestedWindsurfRules, discoverRules } from "./rules";
import {
  discoverWindsurfHooksFile,
  discoverWindsurfUserMcp,
  discoverWindsurfUserRules,
  windsurfUserHooksPath,
  windsurfUserSkillsPath,
} from "./windsurf";
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
  const platform = fact.platform === undefined ? "" : `:${fact.platform}`;
  const layer = fact.claudeMcpLayer === undefined ? "" : `:${fact.claudeMcpLayer}`;
  return `${fact.name}@${fact.path}${platform}${layer}`;
}

function uniqueRules(facts: RuleFact[]): RuleFact[] {
  const seen = new Set<string>();
  const out: RuleFact[] = [];
  for (const fact of facts) {
    const key = resolve(fact.path);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(fact);
  }
  return out;
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
      join(claudeConfigDir(), "skills"),
      join(home, ".codex", "skills"),
      join(home, ".commandcode", "skills"),
      join(home, ".agents", "skills"),
      join(grokHomeDir(), "skills"),
      windsurfUserSkillsPath(home),
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
  let codexProjectDocFallbackFilenames: string[] | undefined;
  let codexProjectRootMarkers: string[] | undefined;
  for (const dir of dirs) {
    hooks.push(...discoverHooks(dir, configErrors));
    hooks.push(...discoverVscodeHooks(dir, configErrors));
    hooks.push(...discoverCopilotSettingsHooks(dir, configErrors));
    hooks.push(...discoverGrokHooks(join(dir, ".grok", "hooks"), dir, configErrors));
    hooks.push(...discoverGeminiHooks(dir, configErrors));
    hooks.push(
      ...discoverWindsurfHooksFile(join(dir, ".windsurf", "hooks.json"), dir, configErrors),
    );
    hooks.push(
      ...discoverCursorHooksFile(join(dir, ".cursor", "hooks.json"), dir, configErrors),
    );
    const discovered = discoverMcpSurface(dir, config.mcpPaths, configErrors);
    if (discovered.codexProjectDocMaxBytes !== undefined && codexProjectDocMaxBytes === undefined) {
      codexProjectDocMaxBytes = discovered.codexProjectDocMaxBytes;
    }
    if (
      discovered.codexProjectDocFallbackFilenames !== undefined &&
      codexProjectDocFallbackFilenames === undefined
    ) {
      codexProjectDocFallbackFilenames = discovered.codexProjectDocFallbackFilenames;
    }
    if (discovered.codexProjectRootMarkers !== undefined && codexProjectRootMarkers === undefined) {
      codexProjectRootMarkers = discovered.codexProjectRootMarkers;
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
  rules.push(...discoverNestedWindsurfRules(scanBoundary, configErrors));
  mcp.push(...discoverNestedContinueMcp(scanBoundary, configErrors, mcpSeen));
  const pluginRoots = findPluginRoots(scanBoundary, configErrors);
  hooks.push(...discoverPluginHooks(scanBoundary, configErrors, pluginRoots));
  const pluginSurfaces = discoverPluginSurfaces(
    scanBoundary,
    configErrors,
    configuredRoots,
    pluginRoots,
  );
  skills.push(...pluginSurfaces.skills);
  agents.push(...pluginSurfaces.agents);
  for (const fact of pluginSurfaces.mcp) {
    const key = mcpKey(fact);
    if (mcpSeen.has(key)) {
      continue;
    }
    mcpSeen.add(key);
    mcp.push(fact);
  }
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
    hooks.push(...discoverClaudeUserHooks(root, configErrors));
    hooks.push(...discoverCopilotUserHooks(configErrors));
    hooks.push(...discoverCopilotUserSettingsHooks(configErrors));
    hooks.push(...discoverGrokHooks(join(grokHomeDir(), "hooks"), grokHomeDir(), configErrors));
    for (const fact of discoverClaudeUserMcp(configErrors, [root, startDir, scanBoundary])) {
      const key = mcpKey(fact);
      if (mcpSeen.has(key)) {
        continue;
      }
      mcpSeen.add(key);
      mcp.push(fact);
    }
    for (const fact of discoverGrokUserMcp(configErrors)) {
      const key = mcpKey(fact);
      if (mcpSeen.has(key)) {
        continue;
      }
      mcpSeen.add(key);
      mcp.push(fact);
    }
    for (const fact of discoverCodexUserMcp(configErrors)) {
      const key = mcpKey(fact);
      if (mcpSeen.has(key)) {
        continue;
      }
      mcpSeen.add(key);
      mcp.push(fact);
    }
    for (const fact of discoverCommandcodeUserMcp(commandcodeProjectRoot, configErrors)) {
      const key = mcpKey(fact);
      if (mcpSeen.has(key)) {
        continue;
      }
      mcpSeen.add(key);
      mcp.push(fact);
    }
    for (const fact of discoverWindsurfUserMcp(configErrors)) {
      const key = mcpKey(fact);
      if (mcpSeen.has(key)) {
        continue;
      }
      mcpSeen.add(key);
      mcp.push(fact);
    }
    rules.push(...discoverClaudeUserRules(configErrors));
    rules.push(...discoverWindsurfUserRules(configErrors));
    const userWindsurfHooks = windsurfUserHooksPath();
    hooks.push(
      ...discoverWindsurfHooksFile(
        userWindsurfHooks,
        dirname(userWindsurfHooks),
        configErrors,
      ),
    );
  }
  applyCommandcodeMcpPrecedence(mcp, commandcodeProjectRoot);
  applyGrokMcpPrecedence(mcp, startDir);
  const slashCommands = [
    ...discoverCommandcodeCommands(
      commandcodeProjectRoot,
      opts.includeGlobal,
      configErrors,
    ),
    ...discoverClaudeCommands(startDir, scanBoundary, opts.includeGlobal, root, configErrors),
    ...pluginSurfaces.commands,
  ];
  const mods = discoverCommandcodeMods(ccLayers);
  const winningModel = winningCommandcodeModel(ccLayers);
  const allHooks = [
    ...hooks,
    ...skills.flatMap((s) => s.frontmatterHooks ?? []),
    ...agents.flatMap((a) => a.frontmatterHooks ?? []),
    ...slashCommands.flatMap((command) => command.frontmatterHooks ?? []),
  ];
  applyCommandcodeHookPrecedence(allHooks);

  const codexProjectRoot = resolveCodexProjectRoot(
    startDir,
    scanBoundary,
    codexProjectRootMarkers,
  );
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
      codexProjectDocFallbackFilenames ?? [],
    ),
    rules: uniqueRules(rules),
    lockedSkills: lock.locked,
    hasSkillsLock: lock.present,
    skillsLockInvalid: lock.invalid,
    ...(lock.lockRoots.length === 0 ? {} : { skillLockRoots: lock.lockRoots }),
    configErrors,
    ...(codexProjectDocMaxBytes === undefined ? {} : { codexProjectDocMaxBytes }),
    ...(codexProjectDocFallbackFilenames === undefined
      ? {}
      : { codexProjectDocFallbackFilenames }),
    ...(codexProjectRootMarkers === undefined ? {} : { codexProjectRootMarkers }),
    codexProjectRoot,
    ...(slashCommands.length === 0 ? {} : { slashCommands }),
    ...(mods.length === 0 ? {} : { mods }),
    ...(winningModel === undefined
      ? {}
      : { commandcodeModel: winningModel.model, commandcodeModelSource: winningModel.source }),
    commandcodeProjectRoot,
  };
}
