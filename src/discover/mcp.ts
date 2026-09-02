import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join } from "node:path";
import { parse as parseToml } from "smol-toml";
import { parse as parseYaml } from "yaml";
import {
  consumedByForMcpProfile,
  mcpProfileFromPath,
  sourceProviderForMcpProfile,
  type McpLaunchKind,
  type McpSchemaProfile,
} from "../facts/provider";
import type { ConfigErrorFact, McpFact } from "../facts/types";
import {
  CLAUDE_MCP_TRANSPORTS,
  COMMANDCODE_MCP_TRANSPORTS,
  COMMANDCODE_TOLERATED_MCP_TRANSPORTS,
} from "../facts/commandcode";
import { parseJsonc } from "./jsonc";
import {
  formatLaunch,
  launchesFromEntry,
  resolveLaunchCwd,
  scriptCandidateFromLaunch,
  skipLaunchExistenceCheck,
} from "./launch";
import { NESTED_DISCOVERY_MAX_DEPTH, readJsonConfig, walkFiles } from "./shared";

/** Anything that makes the command a shell program rather than one path. */
const SHELL_METACHARS = /[|;&`]|\$\(|\|\||&&|\s/;

// `%VAR%` is Gemini CLI's documented Windows-only env syntax (docs/spec/gemini-mcp.md).
// `{{var}}` is Grok's documented header / env interpolation (docs/spec/grok-mcp.md).
const INTERPOLATED =
  /\$\{[A-Za-z_][A-Za-z0-9_]*(?::-[^}]*)?\}|\$\{env:[A-Za-z_][A-Za-z0-9_]*\}|\$\{file:[^}]+\}|\$\{input:[A-Za-z0-9_-]+\}|\$\{(?:userHome|workspaceFolder|workspaceFolderBasename|pathSeparator|\/)\}|\{env:[A-Za-z_][A-Za-z0-9_]*\}|\$\{\{\s*secrets\.[A-Za-z0-9_.]+\s*\}\}|\{\{[^{}]+\}\}|\$[A-Za-z_][A-Za-z0-9_]*|%[A-Za-z_][A-Za-z0-9_]*%/;

const SECRET_NAMED_KEY = /(?:TOKEN|SECRET|KEY|PASSWORD|PASSWD|CREDENTIAL)S?$/i;
const AUTH_HEADER_NAME = /^(authorization|proxy-authorization)$/i;

/**
 * Decide whether an MCP `command` value is a filesystem path we can check.
 * Returns undefined whenever the answer is not certain — bare PATH binaries
 * (`npx`, `uvx`, `node`) and unresolved env vars are skipped, matching
 * `hookScriptPath`'s anti-false-positive discipline.
 */
export function mcpCommandPath(command: string): string | undefined {
  const trimmed = command.trim();
  if (trimmed.length === 0 || SHELL_METACHARS.test(trimmed)) {
    return undefined;
  }
  if (/^[A-Za-z]:[/\\]/.test(trimmed)) {
    return undefined;
  }
  if (trimmed.startsWith("$")) {
    return /^\$(?:CLAUDE_PROJECT_DIR\b|\{CLAUDE_PROJECT_DIR\}|COMMANDCODE_PROJECT_DIR\b|\{COMMANDCODE_PROJECT_DIR\}|COMMANDCODE_CWD\b|\{COMMANDCODE_CWD\})/.test(
      trimmed,
    )
      ? trimmed
      : undefined;
  }
  if (trimmed === "." || trimmed === "..") {
    return undefined;
  }
  if (
    trimmed.startsWith("/") ||
    trimmed.startsWith("./") ||
    trimmed.startsWith("../") ||
    trimmed.startsWith("~/") ||
    trimmed.startsWith(".")
  ) {
    return trimmed;
  }
  if (trimmed.includes("/")) {
    return trimmed;
  }
  return undefined;
}

function resolveMcpCommand(
  root: string,
  raw: string,
): { command: string; exists: boolean } | undefined {
  const extracted = mcpCommandPath(raw);
  if (extracted === undefined) {
    return undefined;
  }
  let expanded = extracted;
  if (expanded.startsWith("~/")) {
    expanded = join(homedir(), expanded.slice(2));
  } else if (expanded.startsWith("$")) {
    expanded = expanded.replace(
      /^\$(?:CLAUDE_PROJECT_DIR|\{CLAUDE_PROJECT_DIR\}|COMMANDCODE_PROJECT_DIR|\{COMMANDCODE_PROJECT_DIR\}|COMMANDCODE_CWD|\{COMMANDCODE_CWD\})\/?/,
      "",
    );
  }
  const abs = isAbsolute(expanded) ? expanded : join(root, expanded);
  try {
    return { command: extracted, exists: statSync(abs).isFile() };
  } catch {
    return { command: extracted, exists: false };
  }
}

function commandFactsFromEntry(
  entry: Record<string, unknown>,
  root: string,
  hostPlatform: NodeJS.Platform = process.platform,
): Array<{
  hasCommand: boolean;
  command?: string;
  commandExists?: boolean;
  cwd?: string;
  platform?: NonNullable<McpFact["platform"]>;
}> {
  const launches = launchesFromEntry(entry);
  if (launches.length === 0) {
    return [{ hasCommand: false }];
  }
  return launches.map((launch) => {
    const candidate = scriptCandidateFromLaunch(launch);
    const display = candidate ?? formatLaunch(launch);
    const cwd = resolveLaunchCwd(launch.cwd, root, hostPlatform);
    if (candidate === undefined || skipLaunchExistenceCheck(launch, cwd, candidate, hostPlatform)) {
      return {
        hasCommand: true,
        command: formatLaunch(launch),
        ...(launch.cwd === undefined ? {} : { cwd: launch.cwd }),
        ...(launch.platform === undefined ? {} : { platform: launch.platform }),
      };
    }
    const base = cwd.status === "ok" ? cwd.abs : root;
    const resolved = resolveMcpCommand(base, candidate);
    return {
      hasCommand: true,
      command: display,
      ...(launch.cwd === undefined ? {} : { cwd: launch.cwd }),
      ...(resolved === undefined ? {} : { commandExists: resolved.exists }),
      ...(launch.platform === undefined ? {} : { platform: launch.platform }),
    };
  });
}

function isSecretNamedKey(key: string): boolean {
  return SECRET_NAMED_KEY.test(key) || AUTH_HEADER_NAME.test(key);
}

function isLiteralCredentialValue(val: unknown): boolean {
  return typeof val === "string" && val.length > 0 && !INTERPOLATED.test(val);
}

function literalEnvKeysFrom(entry: Record<string, unknown>): string[] {
  const env = entry.env;
  if (env === null || typeof env !== "object" || Array.isArray(env)) {
    return [];
  }
  const keys: string[] = [];
  for (const [key, val] of Object.entries(env as Record<string, unknown>)) {
    if (isLiteralCredentialValue(val) && SECRET_NAMED_KEY.test(key)) {
      keys.push(key);
    }
  }
  return keys;
}

function literalFieldsFromMap(obj: unknown, prefix: string): string[] {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    return [];
  }
  const fields: string[] = [];
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    if (isLiteralCredentialValue(val) && isSecretNamedKey(key)) {
      fields.push(`${prefix}.${key}`);
    }
  }
  return fields;
}

/**
 * Secret-named string values under `headers`, `http_headers`, or `auth`.
 * Paths only — never the values. See docs/spec/mcp.md.
 */
function literalCredentialFieldsFrom(entry: Record<string, unknown>): string[] {
  return [
    ...literalFieldsFromMap(entry.headers, "headers"),
    ...literalFieldsFromMap(entry.http_headers, "http_headers"),
    ...literalFieldsFromMap(entry.auth, "auth"),
  ];
}

function looksLikeServerEntry(
  value: unknown,
  profile: McpSchemaProfile,
): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const entry = value as Record<string, unknown>;
  if (profile === "antigravity-json") {
    return "command" in entry || "serverUrl" in entry || "url" in entry || "type" in entry;
  }
    return (
      "command" in entry ||
      "url" in entry ||
      "type" in entry ||
      "transport" in entry ||
      "serverUrl" in entry ||
      "httpUrl" in entry ||
      "uses" in entry
    );
}

function serversFromObject(
  obj: Record<string, unknown>,
  profile: McpSchemaProfile,
  filePath: string,
  errors: ConfigErrorFact[],
): Record<string, unknown> | undefined {
  if (profile === "vscode-json") {
    if (
      "servers" in obj &&
      obj.servers !== null &&
      typeof obj.servers === "object" &&
      !Array.isArray(obj.servers)
    ) {
      return obj.servers as Record<string, unknown>;
    }
    errors.push({
      path: filePath,
      kind: "unexpected-shape",
      detail: "no usable `servers` object",
    });
    return undefined;
  }

  if (
    "mcpServers" in obj &&
    obj.mcpServers !== null &&
    typeof obj.mcpServers === "object" &&
    !Array.isArray(obj.mcpServers)
  ) {
    return obj.mcpServers as Record<string, unknown>;
  }

  if (
    !("mcpServers" in obj) &&
    Object.keys(obj).length > 0 &&
    Object.values(obj).every((v) => looksLikeServerEntry(v, profile))
  ) {
    return obj;
  }

  errors.push({
    path: filePath,
    kind: "unexpected-shape",
    detail: "no usable `mcpServers` object and the root is not a server map",
  });
  return undefined;
}

function transportFromEntry(entry: Record<string, unknown>): {
  transport?: string;
  transportField?: "transport" | "type";
} {
  if (typeof entry.transport === "string" && entry.transport.length > 0) {
    return { transport: entry.transport, transportField: "transport" };
  }
  if (typeof entry.type === "string" && entry.type.length > 0) {
    return { transport: entry.type, transportField: "type" };
  }
  return {};
}

function commandcodeMcpDefect(
  profile: McpSchemaProfile,
  declared: string | undefined,
  hasCommand: boolean,
  hasUrl: boolean,
): McpFact["commandcodeDefect"] {
  if (profile !== "mcp-json" && profile !== "commandcode-json") {
    return undefined;
  }
  if (declared !== undefined) {
    if (COMMANDCODE_MCP_TRANSPORTS.has(declared)) {
      if (declared === "http" && !hasUrl) {
        return "http-without-url";
      }
      if (declared === "stdio" && !hasCommand) {
        return "stdio-without-command";
      }
      return undefined;
    }
    if (profile === "mcp-json" && CLAUDE_MCP_TRANSPORTS.has(declared)) {
      return undefined;
    }
    if (COMMANDCODE_TOLERATED_MCP_TRANSPORTS.has(declared)) {
      return undefined;
    }
    return "invalid-transport";
  }
  return undefined;
}

function parseMcpServers(
  raw: unknown,
  filePath: string,
  root: string,
  errors: ConfigErrorFact[],
  profile: McpSchemaProfile,
): McpFact[] {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    errors.push({
      path: filePath,
      kind: "unexpected-shape",
      detail: "MCP config root is not an object",
    });
    return [];
  }
  const obj = raw as Record<string, unknown>;
  const servers = serversFromObject(obj, profile, filePath, errors);
  if (servers === undefined) {
    return [];
  }

  const facts: McpFact[] = [];
  const sourceProvider = sourceProviderForMcpProfile(profile);
  const consumedBy = consumedByForMcpProfile(profile);
  for (const [name, value] of Object.entries(servers)) {
    let hasUrl = false;
    let hasServerUrl = false;
    let hasHttpUrl = false;
    let transport: string | undefined;
    let transportField: McpFact["transportField"];
    let literalEnvKeys: string[] = [];
    let literalCredentialFields: string[] = [];
    let uses: string | undefined;
    let commandVariants: ReturnType<typeof commandFactsFromEntry> = [{ hasCommand: false }];
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const entry = value as Record<string, unknown>;
      commandVariants = commandFactsFromEntry(entry, root);
      hasUrl = typeof entry.url === "string" && entry.url.length > 0;
      hasServerUrl =
        typeof entry.serverUrl === "string" && entry.serverUrl.length > 0;
      hasHttpUrl = typeof entry.httpUrl === "string" && entry.httpUrl.length > 0;
      const declared = transportFromEntry(entry);
      transport = declared.transport;
      transportField = declared.transportField;
      if (typeof entry.uses === "string" && entry.uses.length > 0) {
        uses = entry.uses;
      }
      literalEnvKeys = literalEnvKeysFrom(entry);
      literalCredentialFields = literalCredentialFieldsFrom(entry);
    }
    const launchKind: McpLaunchKind =
      profile === "continue-yaml" && uses !== undefined
        ? "registry-reference"
        : commandVariants.some((variant) => variant.hasCommand)
          ? "command"
          : hasUrl || hasServerUrl || hasHttpUrl
            ? "url"
            : "no-launch";
    const variants =
      launchKind === "command"
        ? commandVariants.filter((variant) => variant.hasCommand)
        : [{ hasCommand: false as const }];
    for (const variant of variants) {
      const hasCommand = variant.hasCommand;
      const defect = commandcodeMcpDefect(profile, transport, hasCommand, hasUrl);
      facts.push({
        name,
        path: filePath,
        schemaProfile: profile,
        sourceProvider,
        consumedBy,
        launchKind,
        hasCommand,
        hasUrl,
        ...(uses === undefined ? {} : { uses }),
        ...(hasServerUrl ? { hasServerUrl: true } : {}),
        ...(hasHttpUrl ? { hasHttpUrl: true } : {}),
        ...(variant.command === undefined ? {} : { command: variant.command }),
        ...(variant.commandExists === undefined ? {} : { commandExists: variant.commandExists }),
        ...(variant.cwd === undefined ? {} : { cwd: variant.cwd }),
        ...(variant.platform === undefined ? {} : { platform: variant.platform }),
        ...(transport === undefined ? {} : { transport }),
        ...(transportField === undefined ? {} : { transportField }),
        ...(defect === undefined ? {} : { commandcodeDefect: defect }),
        literalEnvKeys,
        ...(literalCredentialFields.length === 0 ? {} : { literalCredentialFields }),
        raw: JSON.stringify(value),
      });
    }
  }
  return facts;
}

export function parseInlineCommandcodeMcp(
  mcpValue: unknown,
  filePath: string,
  root: string,
  errors: ConfigErrorFact[],
): McpFact[] {
  if (mcpValue === undefined) {
    return [];
  }
  if (mcpValue === null || typeof mcpValue !== "object" || Array.isArray(mcpValue)) {
    errors.push({
      path: filePath,
      kind: "unexpected-shape",
      detail: "`mcp` is not an object",
    });
    return [];
  }
  const servers = (mcpValue as Record<string, unknown>).servers;
  if (servers === undefined) {
    return [];
  }
  if (Array.isArray(servers)) {
    const map: Record<string, unknown> = {};
    const unnamed = new Set<string>();
    for (const [i, item] of servers.entries()) {
      if (item === null || typeof item !== "object" || Array.isArray(item)) {
        continue;
      }
      const entry = item as Record<string, unknown>;
      if (typeof entry.name === "string" && entry.name.length > 0) {
        map[entry.name] = entry;
      } else {
        const key = `inline-${i}`;
        unnamed.add(key);
        map[key] = entry;
      }
    }
    return parseMcpServers({ mcpServers: map }, filePath, root, errors, "commandcode-json").map(
      (fact) =>
        unnamed.has(fact.name)
          ? { ...fact, inventoryOnly: true, commandcodeDefect: undefined }
          : fact,
    );
  }
  if (servers !== null && typeof servers === "object") {
    return parseMcpServers(
      { mcpServers: servers },
      filePath,
      root,
      errors,
      "commandcode-json",
    );
  }
  errors.push({
    path: filePath,
    kind: "unexpected-shape",
    detail: "`mcp.servers` is not an array or object",
  });
  return [];
}

function readTomlConfig(
  path: string,
  errors: ConfigErrorFact[],
): unknown | undefined {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    errors.push({
      path,
      kind: "unreadable",
      detail: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
  try {
    return parseToml(text);
  } catch (err) {
    errors.push({
      path,
      kind: "unexpected-shape",
      detail: err instanceof Error ? err.message.split("\n")[0] ?? err.message : String(err),
    });
    return undefined;
  }
}

function readVscodeConfig(
  path: string,
  errors: ConfigErrorFact[],
): unknown | undefined {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    errors.push({
      path,
      kind: "unreadable",
      detail: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
  try {
    return parseJsonc(text);
  } catch (err) {
    errors.push({
      path,
      kind: "invalid-json",
      detail: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

function parseTomlMcpServers(
  raw: unknown,
  filePath: string,
  root: string,
  errors: ConfigErrorFact[],
  profile: Extract<McpSchemaProfile, "codex-toml" | "grok-toml">,
): McpFact[] {
  const owner = profile === "codex-toml" ? "Codex" : "Grok";
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    errors.push({
      path: filePath,
      kind: "unexpected-shape",
      detail: `${owner} config root is not a TOML table`,
    });
    return [];
  }
  const obj = raw as Record<string, unknown>;
  const servers = obj.mcp_servers;
  if (servers === undefined) {
    return [];
  }
  if (servers === null || typeof servers !== "object" || Array.isArray(servers)) {
    errors.push({
      path: filePath,
      kind: "unexpected-shape",
      detail: "`mcp_servers` is not a TOML table",
    });
    return [];
  }
  return parseMcpServers(
    { mcpServers: servers },
    filePath,
    root,
    errors,
    profile,
  );
}

function parseCodexToml(
  raw: unknown,
  filePath: string,
  root: string,
  errors: ConfigErrorFact[],
): McpFact[] {
  return parseTomlMcpServers(raw, filePath, root, errors, "codex-toml");
}

/** MCP servers only — does not extract `project_doc_*` knobs. */
export function parseCodexTomlFile(
  filePath: string,
  root: string,
  errors: ConfigErrorFact[],
): McpFact[] {
  const raw = readTomlConfig(filePath, errors);
  if (raw === undefined) {
    return [];
  }
  return parseCodexToml(raw, filePath, root, errors);
}

export function parseGrokTomlFile(
  filePath: string,
  root: string,
  errors: ConfigErrorFact[],
): McpFact[] {
  const raw = readTomlConfig(filePath, errors);
  if (raw === undefined) {
    return [];
  }
  return parseTomlMcpServers(raw, filePath, root, errors, "grok-toml");
}

export function parseWindsurfJsonFile(
  filePath: string,
  root: string,
  errors: ConfigErrorFact[],
): McpFact[] {
  const raw = readJsonConfig(filePath, errors);
  if (raw === undefined) {
    return [];
  }
  return parseMcpServers(raw, filePath, root, errors, "windsurf-json");
}

function parseOpenCode(
  raw: unknown,
  filePath: string,
  root: string,
  errors: ConfigErrorFact[],
): McpFact[] {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    errors.push({
      path: filePath,
      kind: "unexpected-shape",
      detail: "OpenCode config root is not an object",
    });
    return [];
  }
  const mcp = (raw as Record<string, unknown>).mcp;
  if (mcp === undefined) {
    return [];
  }
  if (mcp === null || typeof mcp !== "object" || Array.isArray(mcp)) {
    errors.push({
      path: filePath,
      kind: "unexpected-shape",
      detail: "`mcp` is not an object",
    });
    return [];
  }
  const table = mcp as Record<string, unknown>;
  const v2 = table.servers;
  if (v2 !== undefined) {
    if (v2 === null || typeof v2 !== "object" || Array.isArray(v2)) {
      errors.push({
        path: filePath,
        kind: "unexpected-shape",
        detail: "`mcp.servers` is not an object",
      });
      return [];
    }
    const servers = normalizeOpenCodeServers(v2);
    return annotateOpenCode(
      parseMcpServers({ mcpServers: servers }, filePath, root, errors, "opencode-json"),
      servers,
      "v2",
    );
  }
  const v1: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(table)) {
    if (name === "timeout") {
      continue;
    }
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      v1[name] = value;
    }
  }
  const servers = normalizeOpenCodeServers(v1);
  return annotateOpenCode(
    parseMcpServers({ mcpServers: servers }, filePath, root, errors, "opencode-json"),
    servers,
    "v1",
  );
}

function entryHasCommand(entry: Record<string, unknown>): boolean {
  return launchesFromEntry(entry).length > 0;
}

function classifyOpenCodeEntry(
  entry: Record<string, unknown>,
  schema: "v1" | "v2",
): Pick<McpFact, "opencodeSchema" | "opencodeInherit" | "opencodeDefect"> {
  const type = typeof entry.type === "string" ? entry.type : undefined;
  const hasCommand = entryHasCommand(entry);
  const hasUrl = typeof entry.url === "string" && entry.url.length > 0;
  const commandIsArray = Array.isArray(entry.command);

  if (schema === "v1" && !hasCommand && !hasUrl) {
    return { opencodeSchema: "v1", opencodeInherit: true };
  }

  if (type !== "local" && type !== "remote") {
    return { opencodeSchema: schema, opencodeDefect: "missing-type" };
  }
  if (type === "local") {
    if (hasUrl) {
      return { opencodeSchema: schema, opencodeDefect: "invalid-launch-for-type" };
    }
    if (schema === "v2" && "command" in entry && !commandIsArray) {
      return { opencodeSchema: schema, opencodeDefect: "command-not-array" };
    }
    if (!hasCommand) {
      return { opencodeSchema: schema, opencodeDefect: "local-without-command" };
    }
    return { opencodeSchema: schema };
  }
  if (hasCommand) {
    return { opencodeSchema: schema, opencodeDefect: "invalid-launch-for-type" };
  }
  if (!hasUrl) {
    return { opencodeSchema: schema, opencodeDefect: "remote-without-url" };
  }
  return { opencodeSchema: schema };
}

function annotateOpenCode(
  facts: McpFact[],
  servers: Record<string, unknown>,
  schema: "v1" | "v2",
): McpFact[] {
  return facts.map((fact) => {
    const raw = servers[fact.name];
    const entry =
      raw !== null && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};
    return { ...fact, ...classifyOpenCodeEntry(entry, schema) };
  });
}

function normalizeOpenCodeServers(servers: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (servers === null || typeof servers !== "object" || Array.isArray(servers)) {
    return out;
  }
  for (const [name, value] of Object.entries(servers as Record<string, unknown>)) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      out[name] = value;
      continue;
    }
    const entry = { ...(value as Record<string, unknown>) };
    if (entry.env === undefined && entry.environment !== undefined) {
      entry.env = entry.environment;
    }
    out[name] = entry;
  }
  return out;
}

function continueServersFromList(list: unknown[]): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const [i, item] of list.entries()) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const entry = item as Record<string, unknown>;
    const name = typeof entry.name === "string" && entry.name.length > 0 ? entry.name : `server-${i}`;
    mapped[name] = entry;
  }
  return mapped;
}

function continueMissingMetadataKeys(obj: Record<string, unknown>): string[] {
  const missing: string[] = [];
  if (typeof obj.name !== "string" || obj.name.length === 0) {
    missing.push("name");
  }
  if (obj.version === undefined || (typeof obj.version !== "string" && typeof obj.version !== "number")) {
    missing.push("version");
  }
  if (typeof obj.schema !== "string" || obj.schema.length === 0) {
    missing.push("schema");
  }
  return missing;
}

function parseContinueDocument(
  raw: unknown,
  filePath: string,
  root: string,
  errors: ConfigErrorFact[],
): McpFact[] {
  const standaloneYaml = isContinueStandaloneYaml(filePath);
  const annotate = (facts: McpFact[], doc: Record<string, unknown> | undefined): McpFact[] => {
    if (!standaloneYaml || doc === undefined) {
      return facts;
    }
    const missing = continueMissingMetadataKeys(doc);
    if (missing.length === 0) {
      return facts;
    }
    return facts.map((fact) => ({ ...fact, continueMissingMetadataKeys: missing }));
  };
  if (Array.isArray(raw)) {
    return parseMcpServers(
      { mcpServers: continueServersFromList(raw) },
      filePath,
      root,
      errors,
      "continue-yaml",
    );
  }
  if (raw === null || typeof raw !== "object") {
    errors.push({
      path: filePath,
      kind: "unexpected-shape",
      detail: "Continue config root is not a mapping",
    });
    return [];
  }
  const obj = raw as Record<string, unknown>;
  const list = obj.mcpServers;
  if (Array.isArray(list)) {
    return annotate(
      parseMcpServers(
        { mcpServers: continueServersFromList(list) },
        filePath,
        root,
        errors,
        "continue-yaml",
      ),
      obj,
    );
  }
  if (list !== undefined) {
    errors.push({
      path: filePath,
      kind: "unexpected-shape",
      detail: "`mcpServers` is not an array",
    });
    return [];
  }
  if (
    typeof obj.uses === "string" ||
    "command" in obj ||
    "url" in obj
  ) {
    const name =
      typeof obj.name === "string" && obj.name.length > 0
        ? obj.name
        : basename(filePath).replace(/\.(ya?ml|jsonc?)$/i, "");
    return annotate(
      parseMcpServers({ mcpServers: { [name]: obj } }, filePath, root, errors, "continue-yaml"),
      obj,
    );
  }
  return [];
}

function isContinueStandaloneYaml(filePath: string): boolean {
  const normalized = filePath.replaceAll("\\", "/");
  if (!normalized.includes("/.continue/mcpServers/")) {
    return false;
  }
  return /\.ya?ml$/i.test(normalized);
}

function readYamlConfig(
  path: string,
  errors: ConfigErrorFact[],
): unknown | undefined {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    errors.push({
      path,
      kind: "unreadable",
      detail: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
  try {
    return parseYaml(text) as unknown;
  } catch (err) {
    errors.push({
      path,
      kind: "unexpected-shape",
      detail: err instanceof Error ? err.message.split("\n")[0] ?? err.message : String(err),
    });
    return undefined;
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function continueMcpFilename(name: string): boolean {
  return /\.(ya?ml|jsonc?)$/i.test(name) && !name.startsWith(".");
}

function parseMcpFile(
  filePath: string,
  root: string,
  errors: ConfigErrorFact[],
): {
  facts: McpFact[];
  projectDocMaxBytes?: number;
  projectDocFallbackFilenames?: string[];
  projectRootMarkers?: string[];
} {
  const profile = mcpProfileFromPath(filePath);
  if (profile === "codex-toml") {
    const raw = readTomlConfig(filePath, errors);
    if (raw === undefined) {
      return { facts: [] };
    }
    const knobs = projectDocSettingsFromToml(raw);
    return {
      facts: parseCodexToml(raw, filePath, root, errors),
      ...knobs,
    };
  }
  if (profile === "grok-toml") {
    return { facts: parseGrokTomlFile(filePath, root, errors) };
  }
  if (profile === "continue-yaml") {
    const raw = filePath.endsWith(".json") || filePath.endsWith(".jsonc")
      ? readVscodeConfig(filePath, errors)
      : readYamlConfig(filePath, errors);
    if (raw === undefined) {
      return { facts: [] };
    }
    return { facts: parseContinueDocument(raw, filePath, root, errors) };
  }
  if (profile === "opencode-json") {
    const raw = readVscodeConfig(filePath, errors);
    if (raw === undefined) {
      return { facts: [] };
    }
    return { facts: parseOpenCode(raw, filePath, root, errors) };
  }
  const raw =
    profile === "vscode-json" || profile === "cursor-json" || profile === "gemini-json"
      ? readVscodeConfig(filePath, errors)
      : readJsonConfig(filePath, errors);
  if (raw === undefined) {
    return { facts: [] };
  }
  return { facts: parseMcpServers(raw, filePath, root, errors, profile) };
}

function projectDocSettingsFromToml(raw: unknown): {
  projectDocMaxBytes?: number;
  projectDocFallbackFilenames?: string[];
  projectRootMarkers?: string[];
} {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const obj = raw as Record<string, unknown>;
  const out: {
    projectDocMaxBytes?: number;
    projectDocFallbackFilenames?: string[];
    projectRootMarkers?: string[];
  } = {};
  const maxBytes = obj.project_doc_max_bytes;
  if (typeof maxBytes === "number" && Number.isFinite(maxBytes) && maxBytes > 0) {
    out.projectDocMaxBytes = Math.floor(maxBytes);
  }
  const fallbacks = stringArray(obj.project_doc_fallback_filenames);
  if (fallbacks !== undefined) {
    out.projectDocFallbackFilenames = fallbacks;
  }
  if ("project_root_markers" in obj) {
    const markers = stringArray(obj.project_root_markers);
    out.projectRootMarkers = markers ?? [];
  }
  return out;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const out = value.filter((item): item is string => typeof item === "string" && item.length > 0);
  return out;
}

function discoverContinueMcpDir(
  dir: string,
  root: string,
  errors: ConfigErrorFact[],
  seen: Set<string>,
): McpFact[] {
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
  const facts: McpFact[] = [];
  for (const name of names) {
    if (!continueMcpFilename(name)) {
      continue;
    }
    const filePath = join(dir, name);
    if (isDirectory(filePath)) {
      continue;
    }
    for (const fact of parseMcpFile(filePath, root, errors).facts) {
      const key = `${fact.name}@${fact.path}${fact.platform === undefined ? "" : `:${fact.platform}`}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      facts.push(fact);
    }
  }
  return facts;
}

export function discoverMcpSurface(
  root: string,
  mcpPaths: string[],
  errors: ConfigErrorFact[],
): {
  facts: McpFact[];
  codexProjectDocMaxBytes?: number;
  codexProjectDocFallbackFilenames?: string[];
  codexProjectRootMarkers?: string[];
} {
  const facts: McpFact[] = [];
  const seen = new Set<string>();
  let codexProjectDocMaxBytes: number | undefined;
  let codexProjectDocFallbackFilenames: string[] | undefined;
  let codexProjectRootMarkers: string[] | undefined;
  for (const rel of mcpPaths) {
    const filePath = isAbsolute(rel) ? rel : join(root, rel);
    if (!existsSync(filePath)) {
      continue;
    }
    if (rel.replaceAll("\\", "/").endsWith(".continue/mcpServers") && isDirectory(filePath)) {
      facts.push(...discoverContinueMcpDir(filePath, root, errors, seen));
      continue;
    }
    const parsed = parseMcpFile(filePath, root, errors);
    if (parsed.projectDocMaxBytes !== undefined) {
      codexProjectDocMaxBytes = parsed.projectDocMaxBytes;
    }
    if (parsed.projectDocFallbackFilenames !== undefined) {
      codexProjectDocFallbackFilenames = parsed.projectDocFallbackFilenames;
    }
    if (parsed.projectRootMarkers !== undefined) {
      codexProjectRootMarkers = parsed.projectRootMarkers;
    }
    for (const fact of parsed.facts) {
      const key = `${fact.name}@${fact.path}${fact.platform === undefined ? "" : `:${fact.platform}`}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      facts.push(fact);
    }
  }
  return {
    facts,
    ...(codexProjectDocMaxBytes === undefined ? {} : { codexProjectDocMaxBytes }),
    ...(codexProjectDocFallbackFilenames === undefined
      ? {}
      : { codexProjectDocFallbackFilenames }),
    ...(codexProjectRootMarkers === undefined ? {} : { codexProjectRootMarkers }),
  };
}

export function discoverMcp(
  root: string,
  mcpPaths: string[],
  errors: ConfigErrorFact[],
): McpFact[] {
  return discoverMcpSurface(root, mcpPaths, errors).facts;
}

export function discoverNestedContinueMcp(
  root: string,
  errors: ConfigErrorFact[],
  seen: Set<string>,
): McpFact[] {
  const facts: McpFact[] = [];
  for (const abs of walkFiles(root, {
    maxDepth: NESTED_DISCOVERY_MAX_DEPTH,
    match: (path, name) =>
      path.replaceAll("\\", "/").includes("/.continue/mcpServers/") && continueMcpFilename(name),
    errors,
  })) {
    for (const fact of parseMcpFile(abs, root, errors).facts) {
      const key = `${fact.name}@${fact.path}${fact.platform === undefined ? "" : `:${fact.platform}`}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      facts.push(fact);
    }
  }
  return facts;
}
