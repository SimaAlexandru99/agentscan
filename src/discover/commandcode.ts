import { existsSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { isInside, toPosix } from "../facts/paths";
import { applyPrecedence } from "../facts/precedence";
import { providerHome } from "../facts/providers";
import {
  COMMANDCODE_AGENTS_SKILLS_MAX_HOPS,
  COMMANDCODE_PERMISSION_MODES,
  COMMANDCODE_RESERVED_AGENT_NAMES,
} from "../facts/commandcode";
import type {
  AgentFact,
  CommandcodeAgentDefect,
  HookFact,
  McpFact,
  SkillFact,
  SlashCommandFact,
} from "../facts/types";
import { commandcodeMcpDefect, discoverMcpSurface, parseInlineCommandcodeMcp } from "./mcp";
import { commandFiles } from "./claude";
import { expandHome } from "./launch";
import { hooksFromObject } from "./hooks";
import { ancestorDirsInclusive, type ScanContext } from "./scan-context";
import { readFrontmatter } from "./frontmatter";
import { isFile, isRecord, listDir, readConfigFile, type ScanIO } from "./fs";

export type CommandcodeSettingsKind = "local" | "project" | "user";

export type CommandcodeSettingsLayer = {
  path: string;
  kind: CommandcodeSettingsKind;
  skills?: string[];
  mcp?: unknown;
  hooks?: unknown;
};

const SETTINGS_LAYER_RANK: Record<CommandcodeSettingsKind, number> = {
  local: 3,
  project: 2,
  user: 1,
};

function readSettingsObject(
  filePath: string,
  io: ScanIO,
): Record<string, unknown> | undefined {
  const raw = readConfigFile(filePath, io, { optional: true });
  if (raw === undefined) {
    return undefined;
  }
  if (!isRecord(raw)) {
    io.errors.push({
      path: filePath,
      kind: "unexpected-shape",
      detail: "settings file is not a JSON object",
    });
    return undefined;
  }
  return raw;
}

function layerFromObject(
  filePath: string,
  kind: CommandcodeSettingsKind,
  obj: Record<string, unknown>,
): CommandcodeSettingsLayer {
  const layer: CommandcodeSettingsLayer = { path: filePath, kind };
  if (Array.isArray(obj.skills) && obj.skills.every((item) => typeof item === "string")) {
    layer.skills = obj.skills as string[];
  }
  if (obj.mcp !== undefined) {
    layer.mcp = obj.mcp;
  }
  if (obj.hooks !== undefined) {
    layer.hooks = obj.hooks;
  }
  return layer;
}

export function readCommandcodeSettingsLayers(
  commandcodeProjectRoot: string,
  io: ScanIO,
  includeGlobal: boolean,
): CommandcodeSettingsLayer[] {
  const layers: CommandcodeSettingsLayer[] = [];
  const candidates: { path: string; kind: CommandcodeSettingsKind }[] = [
    { path: join(commandcodeProjectRoot, ".commandcode", "settings.local.json"), kind: "local" },
    { path: join(commandcodeProjectRoot, ".commandcode", "settings.json"), kind: "project" },
    ...(includeGlobal
      ? [{ path: join(providerHome("commandcode"), "settings.json"), kind: "user" as const }]
      : []),
  ];
  for (const candidate of candidates) {
    const obj = readSettingsObject(candidate.path, io);
    if (obj === undefined) {
      continue;
    }
    layers.push(layerFromObject(candidate.path, candidate.kind, obj));
  }
  return layers;
}

export function winningSkillsExtraDirs(
  layers: CommandcodeSettingsLayer[],
): string[] {
  for (const layer of layers) {
    if (layer.skills !== undefined) {
      return layer.skills;
    }
  }
  return [];
}

export function resolveSkillLocation(commandcodeProjectRoot: string, declared: string): string {
  const expanded = expandHome(declared.trim());
  return isAbsolute(expanded) ? expanded : join(commandcodeProjectRoot, expanded);
}

export function discoverCommandcodeHooks(
  commandcodeProjectRoot: string,
  layers: CommandcodeSettingsLayer[],
  io: ScanIO,
): HookFact[] {
  const facts: HookFact[] = [];
  for (const layer of layers) {
    if (layer.hooks === undefined) {
      continue;
    }
    facts.push(
      ...hooksFromObject(
        layer.hooks,
        layer.path,
        "settings",
        { project: commandcodeProjectRoot, own: dirname(layer.path) },
        io,
        { sourceProvider: "commandcode", schemaProfile: "commandcode" },
      ).map((hook) => ({ ...hook, commandcodeSettingsLayer: layer.kind })),
    );
  }
  return facts;
}

export function discoverCommandcodeInlineMcp(
  commandcodeProjectRoot: string,
  layers: CommandcodeSettingsLayer[],
  io: ScanIO,
): McpFact[] {
  const facts: McpFact[] = [];
  for (const layer of layers) {
    if (layer.mcp === undefined) {
      continue;
    }
    facts.push(
      ...parseInlineCommandcodeMcp(layer.mcp, layer.path, commandcodeProjectRoot, io),
    );
  }
  return facts;
}

/**
 * Command Code project root: the nearest git root from the working directory
 * up to the scan boundary, otherwise the working directory. A child `.cursor`
 * / `.claude` must not hide `<git-root>/.commandcode/settings.json`; a
 * `.agentscan-root` pin still stops the scan escaping into a parent checkout.
 */
export function resolveCommandcodeProjectRoot(
  ctx: Pick<ScanContext, "startDir" | "scanBoundary">,
): string {
  return (
    ancestorDirsInclusive(ctx.startDir, ctx.scanBoundary).find((dir) =>
      existsSync(join(dir, ".git")),
    ) ?? resolve(ctx.startDir)
  );
}

/**
 * Command Code also reads the shared `<project>/.mcp.json`; its servers there
 * get Command Code transport defects. Other `.mcp.json` files are not its.
 */
export function applyCommandcodeMcpJsonDefects(
  mcp: McpFact[],
  commandcodeProjectRoot: string,
): void {
  const file = resolve(join(commandcodeProjectRoot, ".mcp.json"));
  for (const fact of mcp) {
    if (fact.schemaProfile !== "mcp-json" || resolve(fact.path) !== file) {
      continue;
    }
    const defect = commandcodeMcpDefect("mcp-json", fact.transport, fact.hasCommand, fact.hasUrl);
    if (defect !== undefined) {
      fact.commandcodeDefect = defect;
    }
  }
}

export function discoverCommandcodeUserMcp(
  commandcodeProjectRoot: string,
  io: ScanIO,
): McpFact[] {
  return discoverMcpSurface(
    commandcodeProjectRoot,
    [join(providerHome("commandcode"), "mcp.json")],
    io,
  );
}

export function discoverCommandcodeCommands(
  commandcodeProjectRoot: string,
  includeGlobal: boolean,
  io: ScanIO,
): SlashCommandFact[] {
  const facts: SlashCommandFact[] = [];
  const seen = new Set<string>();
  const projectDir = join(commandcodeProjectRoot, ".commandcode", "commands");
  seen.add(projectDir);
  for (const rel of commandFiles(projectDir, io)) {
    facts.push({
      name: basename(rel, ".md"),
      path: join(projectDir, rel),
      source: "project",
      sourceProvider: "commandcode",
    });
  }
  if (includeGlobal) {
    const userDir = join(providerHome("commandcode"), "commands");
    if (!seen.has(userDir)) {
      for (const rel of commandFiles(userDir, io)) {
        facts.push({
          name: basename(rel, ".md"),
          path: join(userDir, rel),
          source: "global",
          sourceProvider: "commandcode",
        });
      }
    }
  }
  return facts;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isPositiveInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function firstInvalidCommandcodeAgentField(
  fields: Record<string, unknown>,
): string | undefined {
  if (fields.name !== undefined && typeof fields.name !== "string") {
    return "name";
  }
  if (fields.description !== undefined && typeof fields.description !== "string") {
    return "description";
  }
  if (
    fields.tools !== undefined &&
    typeof fields.tools !== "string" &&
    !isStringArray(fields.tools)
  ) {
    return "tools";
  }
  if (
    fields.disallowedTools !== undefined &&
    typeof fields.disallowedTools !== "string" &&
    !isStringArray(fields.disallowedTools)
  ) {
    return "disallowedTools";
  }
  if (fields.model !== undefined && typeof fields.model !== "string") {
    return "model";
  }
  if (fields.maxTurns !== undefined && !isPositiveInteger(fields.maxTurns)) {
    return "maxTurns";
  }
  if (fields.permissionMode !== undefined && typeof fields.permissionMode !== "string") {
    return "permissionMode";
  }
  if (fields.background !== undefined && typeof fields.background !== "boolean") {
    return "background";
  }
  if (fields.showOutput !== undefined && typeof fields.showOutput !== "boolean") {
    return "showOutput";
  }
  return undefined;
}

function commandcodeAgentDefects(
  fields: Record<string, unknown> | undefined,
  resolvedName: string,
): { defects: CommandcodeAgentDefect[]; invalidField?: string; permissionMode?: string } {
  const defects: CommandcodeAgentDefect[] = [];
  let invalidField: string | undefined;
  let permissionMode: string | undefined;
  if (COMMANDCODE_RESERVED_AGENT_NAMES.has(resolvedName.toLowerCase())) {
    defects.push("reserved-name");
  }
  if (fields === undefined) {
    return { defects };
  }
  invalidField = firstInvalidCommandcodeAgentField(fields);
  if (invalidField !== undefined) {
    defects.push("invalid-field-type");
  }
  if (typeof fields.permissionMode === "string") {
    if (!COMMANDCODE_PERMISSION_MODES.has(fields.permissionMode)) {
      defects.push("invalid-permission-mode");
    }
    permissionMode = fields.permissionMode;
  }
  return {
    defects,
    ...(invalidField === undefined ? {} : { invalidField }),
    ...(permissionMode === undefined ? {} : { permissionMode }),
  };
}

function readCommandcodeAgent(
  filePath: string,
  stem: string,
  io: ScanIO,
): AgentFact {
  const fm = readFrontmatter(filePath, io);
  const resolved = fm.name ?? stem;
  const classified = commandcodeAgentDefects(fm.fields, resolved);
  const fact: AgentFact = {
    name: resolved,
    path: filePath,
    sourceProvider: "commandcode",
    schemaProfile: "commandcode-md",
    namespace: dirname(filePath),
    nameSource: fm.name !== undefined ? "frontmatter" : "filename",
    hasFrontmatter: fm.hasFrontmatter,
  };
  if (fm.unreadable === true) {
    fact.unreadable = true;
  }
  if (fm.unparseable === true) {
    fact.unparseableFrontmatter = true;
  }
  if (fm.name !== undefined) {
    fact.frontmatterName = fm.name;
  }
  if (fm.description !== undefined) {
    fact.description = fm.description;
  }
  if (classified.permissionMode !== undefined) {
    fact.permissionMode = classified.permissionMode;
  }
  if (classified.defects.length > 0) {
    fact.commandcodeDefects = classified.defects;
  }
  if (classified.invalidField !== undefined) {
    fact.invalidField = classified.invalidField;
  }
  return fact;
}

function discoverCommandcodeAgentsDir(
  dir: string,
  io: ScanIO,
): AgentFact[] {
  const facts: AgentFact[] = [];
  for (const { name } of listDir(dir, io, { optional: true }) ?? []) {
    if (name.startsWith(".") || !name.endsWith(".md")) {
      continue;
    }
    const filePath = join(dir, name);
    if (!isFile(filePath)) {
      continue;
    }
    facts.push(readCommandcodeAgent(filePath, name.slice(0, -".md".length), io));
  }
  return facts;
}

export function discoverCommandcodeAgents(
  commandcodeProjectRoot: string,
  includeGlobal: boolean,
  io: ScanIO,
): AgentFact[] {
  const facts: AgentFact[] = [];
  facts.push(
    ...discoverCommandcodeAgentsDir(
      join(commandcodeProjectRoot, ".commandcode", "agents"),
      io,
    ),
  );
  if (includeGlobal) {
    facts.push(
      ...discoverCommandcodeAgentsDir(join(providerHome("commandcode"), "agents"), io),
    );
  }
  // A personal agent shadows a project agent of the same name.
  const table: RankTable = [
    [resolve(join(providerHome("commandcode"), "agents")), 1],
    [resolve(join(commandcodeProjectRoot, ".commandcode", "agents")), 0],
  ];
  applyPrecedence(
    facts,
    (agent) => agent.name,
    (agent) => rankIn(table, (dir) => isInside(agent.path, dir)),
  );
  return facts;
}

/**
 * Official `.agents/skills` walk-up: hops 0..10 from cwd, stopping before home
 * and not walking above the scan boundary.
 */
export function commandcodeAgentsSkillsRoots(
  startDir: string,
  scanBoundary: string,
  home: string,
): string[] {
  const out: string[] = [];
  let dir = resolve(startDir);
  const stop = resolve(scanBoundary);
  const homeDir = resolve(home);
  for (let hop = 0; hop <= COMMANDCODE_AGENTS_SKILLS_MAX_HOPS; hop++) {
    if (dir === homeDir) {
      break;
    }
    out.push(join(dir, ".agents", "skills"));
    if (dir === stop) {
      break;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return out;
}

export function isCommandcodeSkillsRel(rel: string): boolean {
  const normalized = toPosix(rel).replace(/^\.\//, "").replace(/\/+$/, "");
  return normalized === ".commandcode/skills";
}

type RankTable = [string, number][];

function rankIn(table: RankTable, matches: (path: string) => boolean): number | undefined {
  return table.find(([dir]) => matches(dir))?.[1];
}

/** Settings (1-3) < user mcp.json (10) < project .mcp.json (20); other Command Code JSON is 0. */
export function applyCommandcodeMcpPrecedence(
  mcp: McpFact[],
  commandcodeProjectRoot: string,
): void {
  const home = providerHome("commandcode");
  const table: RankTable = [
    [resolve(join(commandcodeProjectRoot, ".mcp.json")), 20],
    [resolve(join(home, "mcp.json")), 10],
    [resolve(join(commandcodeProjectRoot, ".commandcode", "settings.local.json")), 3],
    [resolve(join(commandcodeProjectRoot, ".commandcode", "settings.json")), 2],
    [resolve(join(home, "settings.json")), 1],
  ];
  applyPrecedence(
    mcp,
    (entry) => entry.name,
    (entry) => {
      if (entry.inventoryOnly === true) {
        return undefined;
      }
      const p = resolve(entry.path);
      return rankIn(table, (path) => path === p) ?? (entry.schemaProfile === "commandcode-json" ? 0 : undefined);
    },
  );
}

/** Official hook docs: duplicate identity is the exact command string. */
function hookCommandIdentity(hook: HookFact): string | undefined {
  if (typeof hook.command === "string" && hook.command.length > 0) {
    return hook.command;
  }
  return undefined;
}

/**
 * Command Code hook scopes: settings.json-family merge first, then project vs
 * user coexistence. Official hooks page: project and user hooks for the same
 * event both run (project first); only an exact duplicate command string is
 * dropped in favor of the higher-priority scope.
 *
 * settings.local.json vs project settings.json follows settings merge: the
 * `hooks` object is a map (deep-merged), and each event's array is a scalar
 * for that merge (the higher layer that defines the event replaces it).
 */
export function applyCommandcodeHookPrecedence(hooks: HookFact[]): void {
  const winningProjectFamilyRank = new Map<string, number>();
  for (const hook of hooks) {
    if (hook.sourceProvider !== "commandcode") {
      continue;
    }
    const layer = hook.commandcodeSettingsLayer ?? "project";
    if (layer === "user") {
      continue;
    }
    const event = hook.event;
    const rank = SETTINGS_LAYER_RANK[layer];
    const current = winningProjectFamilyRank.get(event);
    if (current === undefined || rank > current) {
      winningProjectFamilyRank.set(event, rank);
    }
  }

  const effectiveProjectCommands = new Map<string, Set<string>>();
  for (const hook of hooks) {
    if (hook.sourceProvider !== "commandcode") {
      continue;
    }
    const layer = hook.commandcodeSettingsLayer ?? "project";
    if (layer === "user") {
      continue;
    }
    const event = hook.event;
    const rank = SETTINGS_LAYER_RANK[layer];
    const effective = winningProjectFamilyRank.get(event) === rank;
    hook.effective = effective;
    if (!effective) {
      continue;
    }
    const identity = hookCommandIdentity(hook);
    if (identity === undefined) {
      continue;
    }
    const commands = effectiveProjectCommands.get(event);
    if (commands === undefined) {
      effectiveProjectCommands.set(event, new Set([identity]));
    } else {
      commands.add(identity);
    }
  }

  for (const hook of hooks) {
    if (hook.sourceProvider !== "commandcode") {
      continue;
    }
    if (hook.commandcodeSettingsLayer !== "user") {
      continue;
    }
    const identity = hookCommandIdentity(hook);
    const eventCommands = effectiveProjectCommands.get(hook.event);
    hook.effective =
      identity === undefined || eventCommands === undefined || !eventCommands.has(identity);
  }
}

export function applyCommandcodeSkillPrecedence(
  skills: SkillFact[],
  ctx: {
    commandcodeProjectRoot: string;
    extraDirs: string[];
    agentsSkillsRoots: string[];
    includeGlobal: boolean;
  },
): void {
  const projectCc = resolve(join(ctx.commandcodeProjectRoot, ".commandcode", "skills"));
  const userCc = resolve(join(providerHome("commandcode"), "skills"));
  const userAgents = resolve(join(providerHome("agent-skills"), "skills"));
  const projectAgents = ctx.agentsSkillsRoots.map((dir) => resolve(dir));
  const extras = ctx.extraDirs.map((dir) => resolve(dir));

  const table: RankTable = [
    [projectCc, 4],
    ...projectAgents.map((dir): [string, number] => [dir, 3]),
    ...(ctx.includeGlobal ? ([[userCc, 2], [userAgents, 1]] satisfies RankTable) : []),
    ...extras.map((dir): [string, number] => [dir, 0]),
  ];
  applyPrecedence(
    skills,
    (skill) => skill.id,
    (skill) => rankIn(table, (dir) => isInside(resolve(skill.path), dir)),
  );
}
