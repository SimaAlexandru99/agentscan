import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import {
  COMMANDCODE_AGENTS_SKILLS_MAX_HOPS,
  COMMANDCODE_PERMISSION_MODES,
  COMMANDCODE_RESERVED_AGENT_NAMES,
} from "../facts/commandcode";
import type {
  AgentFact,
  CommandcodeAgentDefect,
  ConfigErrorFact,
  HookFact,
  McpFact,
  ModFact,
  SkillFact,
  SlashCommandFact,
} from "../facts/types";
import { parseInlineCommandcodeMcp, discoverMcp } from "./mcp";
import { hooksFromObject } from "./hooks";
import { readFrontmatter, readJsonConfig } from "./shared";

export type CommandcodeSettingsKind = "local" | "project" | "user";

export type CommandcodeSettingsLayer = {
  path: string;
  kind: CommandcodeSettingsKind;
  skills?: string[];
  model?: string;
  mcp?: unknown;
  mods?: unknown;
  hooks?: unknown;
};

const SETTINGS_LAYER_RANK: Record<CommandcodeSettingsKind, number> = {
  local: 3,
  project: 2,
  user: 1,
};

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function pathInside(child: string, parent: string): boolean {
  const c = resolve(child);
  const p = resolve(parent);
  return c === p || c.startsWith(`${p}${sep}`);
}

function readSettingsObject(
  filePath: string,
  errors: ConfigErrorFact[],
): Record<string, unknown> | undefined {
  if (!existsSync(filePath)) {
    return undefined;
  }
  const raw = readJsonConfig(filePath, errors);
  if (raw === undefined) {
    return undefined;
  }
  if (!isObject(raw)) {
    errors.push({
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
  if (typeof obj.model === "string" && obj.model.length > 0) {
    layer.model = obj.model;
  }
  if (obj.mcp !== undefined) {
    layer.mcp = obj.mcp;
  }
  if (obj.mods !== undefined) {
    layer.mods = obj.mods;
  }
  if (obj.hooks !== undefined) {
    layer.hooks = obj.hooks;
  }
  return layer;
}

export function readCommandcodeSettingsLayers(
  commandcodeProjectRoot: string,
  errors: ConfigErrorFact[],
  includeGlobal: boolean,
): CommandcodeSettingsLayer[] {
  const layers: CommandcodeSettingsLayer[] = [];
  const candidates: { path: string; kind: CommandcodeSettingsKind }[] = [
    { path: join(commandcodeProjectRoot, ".commandcode", "settings.local.json"), kind: "local" },
    { path: join(commandcodeProjectRoot, ".commandcode", "settings.json"), kind: "project" },
    ...(includeGlobal
      ? [{ path: join(homedir(), ".commandcode", "settings.json"), kind: "user" as const }]
      : []),
  ];
  for (const candidate of candidates) {
    const obj = readSettingsObject(candidate.path, errors);
    if (obj === undefined) {
      continue;
    }
    layers.push(layerFromObject(candidate.path, candidate.kind, obj));
  }
  return layers;
}

/** Highest-precedence layer that defines `skills` wins (replace, not merge). */
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
  const trimmed = declared.trim();
  if (trimmed.startsWith("~/")) {
    return join(homedir(), trimmed.slice(2));
  }
  if (isAbsolute(trimmed)) {
    return trimmed;
  }
  return join(commandcodeProjectRoot, trimmed);
}

export function winningCommandcodeModel(
  layers: CommandcodeSettingsLayer[],
): { model: string; source: string } | undefined {
  for (const layer of layers) {
    if (layer.model !== undefined) {
      return { model: layer.model, source: layer.path };
    }
  }
  return undefined;
}

export function discoverCommandcodeHooks(
  commandcodeProjectRoot: string,
  layers: CommandcodeSettingsLayer[],
  errors: ConfigErrorFact[],
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
        errors,
        "commandcode",
      ).map((hook) => ({ ...hook, commandcodeSettingsLayer: layer.kind })),
    );
  }
  return facts;
}

export function discoverCommandcodeInlineMcp(
  commandcodeProjectRoot: string,
  layers: CommandcodeSettingsLayer[],
  errors: ConfigErrorFact[],
): McpFact[] {
  const facts: McpFact[] = [];
  for (const layer of layers) {
    if (layer.mcp === undefined) {
      continue;
    }
    facts.push(
      ...parseInlineCommandcodeMcp(layer.mcp, layer.path, commandcodeProjectRoot, errors),
    );
  }
  return facts;
}

export function discoverCommandcodeUserMcp(
  commandcodeProjectRoot: string,
  errors: ConfigErrorFact[],
): McpFact[] {
  return discoverMcp(commandcodeProjectRoot, [join(homedir(), ".commandcode", "mcp.json")], errors);
}

export function discoverCommandcodeMods(
  layers: CommandcodeSettingsLayer[],
): ModFact[] {
  const out: ModFact[] = [];
  for (const layer of layers) {
    if (!isObject(layer.mods)) {
      continue;
    }
    const paths = layer.mods.paths;
    if (!Array.isArray(paths)) {
      continue;
    }
    for (const item of paths) {
      if (typeof item === "string" && item.length > 0) {
        out.push({
          path: item,
          declaredFrom: layer.path,
          sourceProvider: "commandcode",
        });
      }
    }
  }
  return out;
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function commandFiles(dir: string, errors: ConfigErrorFact[]): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch (err) {
    errors.push({
      path: dir,
      kind: "unreadable",
      detail: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
  const out: string[] = [];
  for (const name of names) {
    if (name.startsWith(".")) {
      continue;
    }
    const abs = join(dir, name);
    if (isDirectory(abs)) {
      out.push(...commandFiles(abs, errors).map((rel) => join(name, rel)));
      continue;
    }
    if (name.endsWith(".md") && isFile(abs)) {
      out.push(name);
    }
  }
  return out;
}

export function discoverCommandcodeCommands(
  commandcodeProjectRoot: string,
  includeGlobal: boolean,
  errors: ConfigErrorFact[],
): SlashCommandFact[] {
  const facts: SlashCommandFact[] = [];
  const seen = new Set<string>();
  const projectDir = join(commandcodeProjectRoot, ".commandcode", "commands");
  if (existsSync(projectDir)) {
    seen.add(projectDir);
    for (const rel of commandFiles(projectDir, errors)) {
      facts.push({
        name: basename(rel, ".md"),
        path: join(projectDir, rel),
        source: "project",
        sourceProvider: "commandcode",
      });
    }
  }
  if (includeGlobal) {
    const userDir = join(homedir(), ".commandcode", "commands");
    if (existsSync(userDir) && !seen.has(userDir)) {
      for (const rel of commandFiles(userDir, errors)) {
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
  errors: ConfigErrorFact[],
): AgentFact {
  const fm = readFrontmatter(filePath, errors);
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

export function discoverCommandcodeAgentsDir(
  dir: string,
  errors: ConfigErrorFact[],
): AgentFact[] {
  if (!existsSync(dir)) {
    return [];
  }
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch (err) {
    errors.push({
      path: dir,
      kind: "unreadable",
      detail: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
  const facts: AgentFact[] = [];
  for (const name of names) {
    if (name.startsWith(".") || !name.endsWith(".md")) {
      continue;
    }
    const filePath = join(dir, name);
    if (!isFile(filePath)) {
      continue;
    }
    facts.push(readCommandcodeAgent(filePath, name.slice(0, -".md".length), errors));
  }
  return facts;
}

export function discoverCommandcodeAgents(
  commandcodeProjectRoot: string,
  includeGlobal: boolean,
  errors: ConfigErrorFact[],
): AgentFact[] {
  const facts: AgentFact[] = [];
  facts.push(
    ...discoverCommandcodeAgentsDir(
      join(commandcodeProjectRoot, ".commandcode", "agents"),
      errors,
    ),
  );
  if (includeGlobal) {
    facts.push(
      ...discoverCommandcodeAgentsDir(join(homedir(), ".commandcode", "agents"), errors),
    );
  }
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
  const normalized = rel.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "");
  return normalized === ".commandcode/skills";
}

function mcpCommandcodeScore(
  entry: McpFact,
  commandcodeProjectRoot: string,
  home: string,
): number | undefined {
  if (entry.inventoryOnly === true) {
    return undefined;
  }
  const p = resolve(entry.path);
  const projectMcp = resolve(join(commandcodeProjectRoot, ".mcp.json"));
  const userMcp = resolve(join(home, ".commandcode", "mcp.json"));
  const localSettings = resolve(join(commandcodeProjectRoot, ".commandcode", "settings.local.json"));
  const projectSettings = resolve(join(commandcodeProjectRoot, ".commandcode", "settings.json"));
  const userSettings = resolve(join(home, ".commandcode", "settings.json"));
  // Higher score wins. Band: settings (0) < user mcp.json (10) < project .mcp.json (20).
  if (p === projectMcp) {
    return 20;
  }
  if (p === userMcp) {
    return 10;
  }
  if (p === localSettings) {
    return 3;
  }
  if (p === projectSettings) {
    return 2;
  }
  if (p === userSettings) {
    return 1;
  }
  if (entry.schemaProfile === "commandcode-json") {
    return 0;
  }
  return undefined;
}

export function applyCommandcodeMcpPrecedence(
  mcp: McpFact[],
  commandcodeProjectRoot: string,
): void {
  const home = homedir();
  const ranked: { entry: McpFact; score: number }[] = [];
  for (const entry of mcp) {
    const score = mcpCommandcodeScore(entry, commandcodeProjectRoot, home);
    if (score === undefined) {
      if (entry.schemaProfile === "mcp-json") {
        entry.commandcodeDefect = undefined;
      }
      continue;
    }
    ranked.push({ entry, score });
  }
  const best = new Map<string, number>();
  for (const item of ranked) {
    const current = best.get(item.entry.name);
    if (current === undefined || item.score > current) {
      best.set(item.entry.name, item.score);
    }
  }
  const seenWinner = new Set<string>();
  for (const item of ranked) {
    const winning = best.get(item.entry.name) ?? item.score;
    if (item.score === winning && !seenWinner.has(item.entry.name)) {
      item.entry.commandcodeEffective = true;
      seenWinner.add(item.entry.name);
    } else {
      item.entry.commandcodeEffective = false;
    }
  }
}

function hookEventKey(hook: HookFact): string {
  return hook.event ?? hook.name;
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
    const event = hookEventKey(hook);
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
    const event = hookEventKey(hook);
    const rank = SETTINGS_LAYER_RANK[layer];
    const effective = winningProjectFamilyRank.get(event) === rank;
    hook.commandcodeEffective = effective;
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
    const eventCommands = effectiveProjectCommands.get(hookEventKey(hook));
    hook.commandcodeEffective =
      identity === undefined || eventCommands === undefined || !eventCommands.has(identity);
  }
}

export function applyCommandcodeAgentPrecedence(
  agents: AgentFact[],
  commandcodeProjectRoot: string,
): void {
  const home = homedir();
  const userDir = resolve(join(home, ".commandcode", "agents"));
  const projectDir = resolve(join(commandcodeProjectRoot, ".commandcode", "agents"));
  const personal: AgentFact[] = [];
  const project: AgentFact[] = [];
  for (const agent of agents) {
    if (agent.sourceProvider !== "commandcode") {
      continue;
    }
    if (pathInside(agent.path, userDir)) {
      personal.push(agent);
    } else if (pathInside(agent.path, projectDir)) {
      project.push(agent);
    }
  }
  const seen = new Set<string>();
  for (const agent of [...personal, ...project]) {
    if (seen.has(agent.name)) {
      agent.commandcodeEffective = false;
    } else {
      seen.add(agent.name);
      agent.commandcodeEffective = true;
    }
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
  const home = homedir();
  const projectCc = resolve(join(ctx.commandcodeProjectRoot, ".commandcode", "skills"));
  const userCc = resolve(join(home, ".commandcode", "skills"));
  const userAgents = resolve(join(home, ".agents", "skills"));
  const projectAgents = ctx.agentsSkillsRoots.map((dir) => resolve(dir));
  const extras = ctx.extraDirs.map((dir) => resolve(dir));

  const rankOf = (skill: SkillFact): number | undefined => {
    const p = resolve(skill.path);
    if (pathInside(p, projectCc)) {
      return 4;
    }
    if (projectAgents.some((dir) => pathInside(p, dir))) {
      return 3;
    }
    if (ctx.includeGlobal && pathInside(p, userCc)) {
      return 2;
    }
    if (ctx.includeGlobal && pathInside(p, userAgents)) {
      return 1;
    }
    if (extras.some((dir) => pathInside(p, dir))) {
      return 0;
    }
    return undefined;
  };

  const ranked: { skill: SkillFact; rank: number }[] = [];
  for (const skill of skills) {
    const rank = rankOf(skill);
    if (rank === undefined) {
      continue;
    }
    ranked.push({ skill, rank });
  }
  const best = new Map<string, number>();
  for (const item of ranked) {
    const current = best.get(item.skill.id);
    if (current === undefined || item.rank > current) {
      best.set(item.skill.id, item.rank);
    }
  }
  const seenWinner = new Set<string>();
  for (const item of ranked) {
    const winning = best.get(item.skill.id) ?? item.rank;
    if (item.rank === winning && !seenWinner.has(item.skill.id)) {
      item.skill.commandcodeEffective = true;
      seenWinner.add(item.skill.id);
    } else {
      item.skill.commandcodeEffective = false;
    }
  }
}
