import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join } from "node:path";
import {
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
  SlashCommandFact,
} from "../facts/types";
import { parseInlineCommandcodeMcp, discoverMcp } from "./mcp";
import { hooksFromObject } from "./hooks";
import { ancestorDirsInclusive, readFrontmatter, readJsonConfig } from "./shared";

export type CommandcodeSettingsLayer = {
  path: string;
  skills?: string[];
  model?: string;
  mcp?: unknown;
  mods?: unknown;
  hooks?: unknown;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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
  obj: Record<string, unknown>,
): CommandcodeSettingsLayer {
  const layer: CommandcodeSettingsLayer = { path: filePath };
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
  root: string,
  errors: ConfigErrorFact[],
  includeGlobal: boolean,
): CommandcodeSettingsLayer[] {
  const layers: CommandcodeSettingsLayer[] = [];
  const local = join(root, ".commandcode", "settings.local.json");
  const project = join(root, ".commandcode", "settings.json");
  const user = join(homedir(), ".commandcode", "settings.json");
  for (const path of [local, project, ...(includeGlobal ? [user] : [])]) {
    const obj = readSettingsObject(path, errors);
    if (obj === undefined) {
      continue;
    }
    layers.push(layerFromObject(path, obj));
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

export function resolveSkillLocation(root: string, declared: string): string {
  const trimmed = declared.trim();
  if (trimmed.startsWith("~/")) {
    return join(homedir(), trimmed.slice(2));
  }
  if (isAbsolute(trimmed)) {
    return trimmed;
  }
  return join(root, trimmed);
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
  root: string,
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
        { project: root, own: dirname(layer.path) },
        errors,
        "commandcode",
      ),
    );
  }
  return facts;
}

export function discoverCommandcodeInlineMcp(
  root: string,
  layers: CommandcodeSettingsLayer[],
  errors: ConfigErrorFact[],
): McpFact[] {
  const facts: McpFact[] = [];
  for (const layer of layers) {
    if (layer.mcp === undefined) {
      continue;
    }
    facts.push(...parseInlineCommandcodeMcp(layer.mcp, layer.path, root, errors));
  }
  return facts;
}

export function discoverCommandcodeUserMcp(
  projectRoot: string,
  errors: ConfigErrorFact[],
): McpFact[] {
  return discoverMcp(projectRoot, [join(homedir(), ".commandcode", "mcp.json")], errors);
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
  root: string,
  includeGlobal: boolean,
  errors: ConfigErrorFact[],
  startDir = root,
): SlashCommandFact[] {
  const facts: SlashCommandFact[] = [];
  const seen = new Set<string>();
  for (const dir of ancestorDirsInclusive(startDir, root)) {
    const projectDir = join(dir, ".commandcode", "commands");
    if (seen.has(projectDir) || !existsSync(projectDir)) {
      continue;
    }
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

function yamlKind(value: unknown): "string" | "number" | "boolean" | "other" | "string-array" {
  if (typeof value === "string") {
    return "string";
  }
  if (typeof value === "number") {
    return "number";
  }
  if (typeof value === "boolean") {
    return "boolean";
  }
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return "string-array";
  }
  return "other";
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
  if (fields.permissionMode !== undefined) {
    if (typeof fields.permissionMode !== "string") {
      defects.push("invalid-field-type");
      invalidField ??= "permissionMode";
    } else if (!COMMANDCODE_PERMISSION_MODES.has(fields.permissionMode)) {
      defects.push("invalid-permission-mode");
      permissionMode = fields.permissionMode;
    } else {
      permissionMode = fields.permissionMode;
    }
  }
  if (fields.background !== undefined && typeof fields.background !== "boolean") {
    defects.push("invalid-field-type");
    invalidField ??= "background";
  }
  if (fields.showOutput !== undefined && typeof fields.showOutput !== "boolean") {
    defects.push("invalid-field-type");
    invalidField ??= "showOutput";
  }
  if (fields.maxTurns !== undefined) {
    const kind = yamlKind(fields.maxTurns);
    if (kind !== "number" || !Number.isInteger(fields.maxTurns as number)) {
      defects.push("invalid-field-type");
      invalidField ??= "maxTurns";
    }
  }
  if (fields.tools !== undefined) {
    const kind = yamlKind(fields.tools);
    if (kind !== "string" && kind !== "string-array") {
      defects.push("invalid-field-type");
      invalidField ??= "tools";
    }
  }
  if (fields.disallowedTools !== undefined) {
    const kind = yamlKind(fields.disallowedTools);
    if (kind !== "string" && kind !== "string-array") {
      defects.push("invalid-field-type");
      invalidField ??= "disallowedTools";
    }
  }
  return { defects, ...(invalidField === undefined ? {} : { invalidField }), ...(permissionMode === undefined ? {} : { permissionMode }) };
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
  root: string,
  includeGlobal: boolean,
  errors: ConfigErrorFact[],
  startDir = root,
): AgentFact[] {
  const facts: AgentFact[] = [];
  const seen = new Set<string>();
  for (const dir of ancestorDirsInclusive(startDir, root)) {
    const agentsDir = join(dir, ".commandcode", "agents");
    if (seen.has(agentsDir)) {
      continue;
    }
    seen.add(agentsDir);
    facts.push(...discoverCommandcodeAgentsDir(agentsDir, errors));
  }
  if (includeGlobal) {
    facts.push(
      ...discoverCommandcodeAgentsDir(join(homedir(), ".commandcode", "agents"), errors),
    );
  }
  return facts;
}
