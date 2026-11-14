import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { AgentscanConfig } from "../config/schema";
import { isInside } from "../facts/paths";
import { providerHome, USER_SKILL_PROVIDERS } from "../facts/providers";
import type {
  AgentSurface,
  HookFact,
  McpFact,
  RuleFact,
  SkillFact,
} from "../facts/types";
import { discoverAgents } from "./agents";
import { discoverAntigravityHooksFile } from "./antigravity";
import { discoverClaudeCommands } from "./claude";
import {
  CODEX_PROJECT_DOC_MAX_BYTES,
  discoverCodexProjectHooks,
  discoverCodexUserHooks,
  discoverCodexUserMcp,
  readCodexProjectConfig,
} from "./codex";
import {
  applyCommandcodeHookPrecedence,
  applyCommandcodeMcpPrecedence,
  applyCommandcodeSkillPrecedence,
  commandcodeAgentsSkillsRoots,
  applyCommandcodeMcpJsonDefects,
  discoverCommandcodeCommands,
  discoverCommandcodeHooks,
  discoverCommandcodeInlineMcp,
  discoverCommandcodeUserMcp,
  isCommandcodeSkillsRel,
  readCommandcodeSettingsLayers,
  resolveCommandcodeProjectRoot,
  resolveSkillLocation,
  winningSkillsExtraDirs,
} from "./commandcode";
import { discoverCursorHooksFile, discoverCursorUserMcp } from "./cursor";
import { discoverDevinProject, discoverDevinUser } from "./devin";
import { discoverKiroHooksDir } from "./kiro";
import { applyGrokMcpPrecedence, discoverGrokUserMcp } from "./grok";
import {
  discoverClaudeUserHooks,
  discoverCopilotSettingsHooks,
  discoverCopilotUserHooks,
  discoverCopilotUserSettingsHooks,
  discoverGeminiHooks,
  discoverGeminiUserHooks,
  discoverGrokHooks,
  discoverHooks,
  discoverVscodeHooks,
} from "./hooks";
import {
  addUniqueMcp,
  discoverClaudeUserMcp,
  discoverCopilotUserMcp,
  parseProfiledMcpFile,
  discoverGeminiUserMcp,
  discoverMcpSurface,
  discoverNestedContinueMcp,
} from "./mcp";
import { discoverPluginHooks, discoverPluginSurfaces, findPluginRoots } from "./plugins";
import {
  codexInstructionChain,
  discoverPolicyFiles,
  discoverSkillsLocks,
  resolveCodexProjectRoot,
} from "./policy";
import {
  discoverAntigravityUserRules,
  discoverClaudeUserRules,
  discoverNestedWindsurfRules,
  discoverRules,
} from "./rules";
import {
  discoverWindsurfHooksFile,
  discoverWindsurfUserMcp,
  discoverWindsurfUserRules,
  windsurfUserHooksPath,
} from "./windsurf";
import {
  disambiguateSkills,
  discoverNestedClaudeSkills,
  discoverSkillsInDir,
} from "./skills";
import { newScanIO, type ScanIO } from "./fs";
import { ancestorDirsInclusive, type ScanContext } from "./scan-context";
import { discoverZedProjectMcp, discoverZedUserMcp } from "./zed";

export { resolveRoot, resolveScanContext, type ScanContext, type ScanLocation } from "./scan-context";

/**
 * A file reached twice (scanning `$HOME` with `--global` reads
 * `~/.claude/settings.json` on the walk-up and as user settings) yields the
 * same facts in the same order; the later batch from a seen file is dropped.
 * Same file under another source or provider is a different reader, kept.
 */
function hookFileKey(fact: HookFact): string {
  return `${resolve(fact.path)}\0${fact.source ?? ""}\0${fact.sourceProvider ?? ""}`;
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

function applyLayerPrecedence(
  skills: SkillFact[],
  mcp: McpFact[],
  hooks: HookFact[],
  ctx: {
    commandcodeProjectRoot: string;
    startDir: string;
    extraDirs: string[];
    agentsSkillsRoots: string[];
    includeGlobal: boolean;
  },
): void {
  applyCommandcodeSkillPrecedence(skills, ctx);
  applyCommandcodeMcpJsonDefects(mcp, ctx.commandcodeProjectRoot);
  applyCommandcodeMcpPrecedence(mcp, ctx.commandcodeProjectRoot);
  applyGrokMcpPrecedence(mcp, ctx.startDir);
  applyCommandcodeHookPrecedence(hooks);
}

/** Hook, MCP and rule facts one source contributes; the loop merges and dedupes them. */
type SourceBatch = { hooks?: HookFact[]; mcp?: McpFact[]; rules?: RuleFact[] };
type SourceScan = ScanContext & { config: AgentscanConfig; io: ScanIO };

/**
 * One entry per source of hooks, MCP servers and rules. `project` runs for each
 * directory of the walk-up (nearest first), `nested` once over the scan
 * boundary, `user` once under `--global`. Within a phase, list order is read
 * order, which is the order facts and config errors are reported in.
 */
type Source = {
  id: string;
  project?: (dir: string, scan: SourceScan) => SourceBatch;
  nested?: (scan: SourceScan) => SourceBatch;
  user?: (scan: SourceScan) => SourceBatch;
};

const SOURCES: Source[] = [
  {
    id: "claude",
    project: (dir, { io }) => ({ hooks: discoverHooks(dir, io) }),
    user: ({ root, startDir, scanBoundary, io }) => ({
      hooks: discoverClaudeUserHooks(root, io),
      mcp: discoverClaudeUserMcp(io, [root, startDir, scanBoundary]),
      rules: discoverClaudeUserRules(io),
    }),
  },
  {
    id: "vscode",
    project: (dir, { io }) => ({ hooks: discoverVscodeHooks(dir, io) }),
  },
  {
    id: "copilot",
    project: (dir, { io }) => ({
      hooks: discoverCopilotSettingsHooks(dir, io),
      // Copilot CLI project MCP; same schema as the user mcp-config.json.
      mcp: parseProfiledMcpFile(join(dir, ".github", "mcp.json"), dir, io, "copilot-json", { optional: true }),
    }),
    user: ({ root, io }) => ({
      hooks: [...discoverCopilotUserHooks(io), ...discoverCopilotUserSettingsHooks(io)],
      mcp: discoverCopilotUserMcp(root, io),
    }),
  },
  {
    id: "grok",
    project: (dir, { io }) => ({
      hooks: discoverGrokHooks(join(dir, ".grok", "hooks"), dir, io),
    }),
    user: ({ io }) => ({
      hooks: discoverGrokHooks(join(providerHome("grok"), "hooks"), providerHome("grok"), io),
      mcp: discoverGrokUserMcp(io),
    }),
  },
  {
    id: "gemini",
    project: (dir, { io }) => ({ hooks: discoverGeminiHooks(dir, io) }),
    user: ({ root, io }) => ({
      hooks: discoverGeminiUserHooks(root, io),
      mcp: discoverGeminiUserMcp(root, io),
    }),
  },
  {
    id: "antigravity",
    project: (dir, { io }) => ({
      hooks: discoverAntigravityHooksFile(join(dir, ".agents", "hooks.json"), dir, io),
    }),
    user: ({ root, io }) => ({
      hooks: discoverAntigravityHooksFile(join(providerHome("antigravity"), "hooks.json"), root, io),
      rules: discoverAntigravityUserRules(io),
    }),
  },
  {
    id: "codex",
    project: (dir, { io }) => ({ hooks: discoverCodexProjectHooks(dir, io) }),
    user: ({ root, io }) => ({
      hooks: discoverCodexUserHooks(root, io),
      mcp: discoverCodexUserMcp(io),
    }),
  },
  {
    id: "commandcode",
    user: (scan) => ({
      mcp: discoverCommandcodeUserMcp(resolveCommandcodeProjectRoot(scan), scan.io),
    }),
  },
  {
    id: "devin",
    project: (dir, { io }) => discoverDevinProject(dir, io),
    user: ({ root, io }) => discoverDevinUser(root, io),
  },
  {
    id: "windsurf",
    project: (dir, { io }) => ({
      hooks: discoverWindsurfHooksFile(join(dir, ".windsurf", "hooks.json"), dir, io),
    }),
    nested: ({ scanBoundary, io }) => ({
      rules: discoverNestedWindsurfRules(scanBoundary, io),
    }),
    user: ({ io }) => {
      const mcp = discoverWindsurfUserMcp(io);
      const rules = discoverWindsurfUserRules(io);
      const hooksPath = windsurfUserHooksPath();
      return {
        mcp,
        rules,
        hooks: discoverWindsurfHooksFile(hooksPath, dirname(hooksPath), io),
      };
    },
  },
  {
    id: "cursor",
    project: (dir, { io }) => ({
      hooks: discoverCursorHooksFile(join(dir, ".cursor", "hooks.json"), dir, io),
    }),
    user: ({ root, io }) => ({
      hooks: discoverCursorHooksFile(join(providerHome("cursor"), "hooks.json"), root, io),
      mcp: discoverCursorUserMcp(root, io),
    }),
  },
  {
    id: "kiro",
    project: (dir, { io }) => ({
      hooks: discoverKiroHooksDir(join(dir, ".kiro", "hooks"), dir, io),
    }),
    user: ({ root, io }) => ({
      hooks: discoverKiroHooksDir(join(providerHome("kiro"), "hooks"), root, io),
    }),
  },
  {
    id: "continue",
    nested: ({ scanBoundary, io }) => ({
      mcp: discoverNestedContinueMcp(scanBoundary, io),
    }),
  },
  {
    id: "zed",
    project: (dir, { io }) => ({ mcp: discoverZedProjectMcp(dir, io) }),
    user: ({ root, io }) => ({ mcp: discoverZedUserMcp(root, io) }),
  },
  {
    // Every provider's project MCP file, from the configured `mcpPaths`.
    id: "mcp-paths",
    project: (dir, { config, io }) => ({
      mcp: discoverMcpSurface(dir, config.mcpPaths, io),
    }),
  },
  {
    // Every provider's project rules directories.
    id: "rules",
    project: (dir, { io }) => ({ rules: discoverRules(dir, io) }),
  },
];

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
  ctx: ScanContext,
  config: AgentscanConfig,
  opts: { onNestedDirectoryRead?: () => void; io?: ScanIO } = {},
): AgentSurface {
  const { root, startDir, scanBoundary } = ctx;
  const includeGlobal = config.includeGlobal;
  const commandcodeProjectRoot = resolveCommandcodeProjectRoot(ctx);
  const dirs = ancestorDirsInclusive(startDir, scanBoundary);
  const io = opts.io ?? newScanIO();
  const skills: SkillFact[] = [];
  const configuredRoots = new Set<string>();
  for (const dir of dirs) {
    for (const rel of config.skillPaths) {
      if (isCommandcodeSkillsRel(rel)) {
        continue;
      }
      const abs = resolve(dir, rel);
      configuredRoots.add(abs);
      skills.push(...discoverSkillsInDir(abs, "project", io, root));
    }
  }
  const commandcodeSkills = resolve(commandcodeProjectRoot, ".commandcode", "skills");
  if (!configuredRoots.has(commandcodeSkills)) {
    configuredRoots.add(commandcodeSkills);
    skills.push(...discoverSkillsInDir(commandcodeSkills, "project", io, root));
  }
  skills.push(
    ...discoverNestedClaudeSkills(scanBoundary, configuredRoots, io, {
      onDirectoryRead: opts.onNestedDirectoryRead,
    }),
  );

  const ccLayers = readCommandcodeSettingsLayers(
    commandcodeProjectRoot,
    io,
    includeGlobal,
  );
  const extraDirs: string[] = [];
  for (const declared of winningSkillsExtraDirs(ccLayers)) {
    const abs = resolve(resolveSkillLocation(commandcodeProjectRoot, declared));
    extraDirs.push(abs);
    if (configuredRoots.has(abs)) {
      continue;
    }
    configuredRoots.add(abs);
    const source = isInside(abs, homedir()) ? "global" : "project";
    // Command Code reads extra dirs as Agent Skills, whatever the path suggests.
    skills.push(
      ...discoverSkillsInDir(abs, source, io, root, undefined, "agent-skills"),
    );
  }

  if (includeGlobal) {
    for (const provider of USER_SKILL_PROVIDERS) {
      const abs = join(providerHome(provider), "skills");
      const resolved = resolve(abs);
      if (configuredRoots.has(resolved)) {
        continue;
      }
      configuredRoots.add(resolved);
      skills.push(...discoverSkillsInDir(abs, "global", io, root, provider));
    }
  }

  const agentsSkillsRoots = commandcodeAgentsSkillsRoots(
    startDir,
    scanBoundary,
    homedir(),
  );
  const lock = discoverSkillsLocks(scanBoundary, root, io);
  const agents = discoverAgents(
    scanBoundary,
    io,
    startDir,
    includeGlobal,
    commandcodeProjectRoot,
  );

  const hooks: HookFact[] = [];
  const hookFilesSeen = new Set<string>();
  const addHooks = (batch: HookFact[]): void => {
    const fresh = batch.filter((fact) => !hookFilesSeen.has(hookFileKey(fact)));
    for (const fact of fresh) {
      hookFilesSeen.add(hookFileKey(fact));
    }
    hooks.push(...fresh);
  };
  const mcp: McpFact[] = [];
  const mcpSeen = new Set<string>();
  const addMcp = (batch: McpFact[]): void => addUniqueMcp(mcp, mcpSeen, batch);
  const rules: RuleFact[] = [];
  const merge = (batch: SourceBatch | undefined): void => {
    addHooks(batch?.hooks ?? []);
    addMcp(batch?.mcp ?? []);
    rules.push(...(batch?.rules ?? []));
  };
  const scan: SourceScan = { ...ctx, config, io };
  for (const dir of dirs) {
    for (const source of SOURCES) {
      merge(source.project?.(dir, scan));
    }
  }
  for (const source of SOURCES) {
    merge(source.nested?.(scan));
  }
  const pluginRoots = findPluginRoots(scanBoundary, io);
  addHooks(discoverPluginHooks(scanBoundary, io, pluginRoots));
  const pluginSurfaces = discoverPluginSurfaces(
    scanBoundary,
    io,
    configuredRoots,
    pluginRoots,
  );
  const layeredSkills = [...skills];
  skills.push(...pluginSurfaces.skills);
  agents.push(...pluginSurfaces.agents);
  addMcp(pluginSurfaces.mcp);
  addHooks(discoverCommandcodeHooks(commandcodeProjectRoot, ccLayers, io));
  addMcp(discoverCommandcodeInlineMcp(commandcodeProjectRoot, ccLayers, io));
  if (includeGlobal) {
    for (const source of SOURCES) {
      merge(source.user?.(scan));
    }
  }
  // Commands are read only for their frontmatter hooks.
  const commands = [
    ...discoverCommandcodeCommands(
      commandcodeProjectRoot,
      includeGlobal,
      io,
    ),
    ...discoverClaudeCommands(startDir, scanBoundary, includeGlobal, root, io),
    ...pluginSurfaces.commands,
  ];
  const allHooks = [
    ...hooks,
    ...skills.flatMap((s) => s.frontmatterHooks ?? []),
    ...agents.flatMap((a) => a.frontmatterHooks ?? []),
    ...commands.flatMap((command) => command.frontmatterHooks ?? []),
  ];
  applyLayerPrecedence(layeredSkills, mcp, allHooks, {
    commandcodeProjectRoot,
    startDir,
    extraDirs,
    agentsSkillsRoots,
    includeGlobal,
  });

  const codex = readCodexProjectConfig(dirs, config.mcpPaths, io);
  const codexProjectRoot = resolveCodexProjectRoot(startDir, scanBoundary, codex.projectRootMarkers);
  const fallbacks = codex.projectDocFallbackFilenames ?? [];
  const policyFiles = discoverPolicyFiles(
    scanBoundary,
    config.policyFiles,
    io,
    startDir,
    includeGlobal,
    fallbacks,
  );
  return {
    skills: disambiguateSkills(skills, root),
    agents,
    hooks: allHooks,
    mcp,
    policyFiles,
    rules: uniqueRules(rules),
    lockedSkills: lock.locked,
    hasSkillsLock: lock.present,
    skillsLockInvalid: lock.invalid,
    skillLockRoots: lock.lockRoots,
    configErrors: io.errors,
    codexProjectDocMaxBytes: codex.projectDocMaxBytes ?? CODEX_PROJECT_DOC_MAX_BYTES,
    codexInstructionChain: codexInstructionChain(policyFiles, startDir, codexProjectRoot, fallbacks),
  };
}
