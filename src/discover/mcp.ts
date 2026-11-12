import { homedir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import { MCP_PROFILES } from "../facts/mcp-profiles";
import { providerHome } from "../facts/providers";
import { toPosix } from "../facts/paths";
import {
  mcpProfileFromPath,
  type McpLaunchKind,
  type McpSchemaProfile,
} from "../facts/provider";
import { INTERPOLATED } from "../facts/text";
import type { McpFact } from "../facts/types";
import {
  CLAUDE_MCP_TRANSPORTS,
  COMMANDCODE_MCP_TRANSPORTS,
  COMMANDCODE_TOLERATED_MCP_TRANSPORTS,
} from "../facts/commandcode";
import {
  checkLaunchScript,
  formatLaunch,
  isProjectDirPlaceholder,
  launchesFromEntry,
  looksLikePath,
  SHELL_METACHARS,
} from "./launch";
import { NESTED_DISCOVERY_MAX_DEPTH, walkFiles } from "./shared";
import { isDirectory, isRecord, listDir, readConfigFile, reportRootShapeOnce, type ScanIO } from "./fs";

/**
 * Token shapes worth failing a build over. Deliberately narrow — no entropy
 * guessing.
 *
 * ORDER IS SIGNIFICANT: the caller uses `.find()`, so a more specific prefix
 * must come before any pattern that also matches it. `sk-ant-` is a subset of
 * `sk-`, and reporting the wrong provider on a "rotate this key" finding sends
 * the user to the wrong dashboard.
 */
const SECRET_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "Anthropic key", re: /\bsk-ant-[A-Za-z0-9_-]{16,}/ },
  { label: "OpenAI project key", re: /\bsk-proj-[A-Za-z0-9_-]{16,}/ },
  { label: "OpenAI service-account key", re: /\bsk-svcacct-[A-Za-z0-9_-]{16,}/ },
  { label: "OpenAI-style key", re: /\bsk-[A-Za-z0-9_]{20,}\b/ },
  { label: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{20,}/ },
  { label: "Google API key", re: /\bAIza[A-Za-z0-9_-]{20,}/ },
  { label: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { label: "AWS access key id", re: /\bAKIA[0-9A-Z]{16}\b/ },
];

/** Label of the first secret shape in a raw server entry; interpolated refs never count. */
export function secretLabelOf(raw: string): string | undefined {
  const text = raw.replace(new RegExp(INTERPOLATED.source, "g"), "");
  return SECRET_PATTERNS.find((p) => p.re.test(text))?.label;
}


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
  // Stricter than a hook command: any whitespace means more than one path.
  if (SHELL_METACHARS.test(trimmed) || /\s/.test(trimmed)) {
    return undefined;
  }
  if (/^[A-Za-z]:[/\\]/.test(trimmed)) {
    return undefined;
  }
  if (trimmed.startsWith("$")) {
    return isProjectDirPlaceholder(trimmed) ? trimmed : undefined;
  }
  return looksLikePath(trimmed) ? trimmed : undefined;
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
    const script = checkLaunchScript(launch, { project: root }, hostPlatform);
    const checked = script !== undefined && mcpCommandPath(script.scriptPath) !== undefined;
    return {
      hasCommand: true,
      command: script?.scriptPath ?? formatLaunch(launch),
      ...(launch.cwd === undefined ? {} : { cwd: launch.cwd }),
      ...(checked ? { commandExists: script.exists } : {}),
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
  if (!isRecord(env)) {
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
  if (!isRecord(obj)) {
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
  if (!isRecord(value)) {
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
  io: ScanIO,
): Record<string, unknown> | undefined {
  if (profile === "vscode-json") {
    if (isRecord(obj.servers)) {
      return obj.servers;
    }
    io.errors.push({
      path: filePath,
      kind: "unexpected-shape",
      detail: "no usable `servers` object",
    });
    return undefined;
  }

  if (isRecord(obj.mcpServers)) {
    return obj.mcpServers;
  }

  if (
    !("mcpServers" in obj) &&
    Object.keys(obj).length > 0 &&
    Object.values(obj).every((v) => looksLikeServerEntry(v, profile))
  ) {
    return obj;
  }

  io.errors.push({
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

/**
 * Command Code's verdict on one server's transport. Applied to every
 * `commandcode-json` server here, and by the Command Code source to the shared
 * `.mcp.json` servers only on the files Command Code reads.
 */
export function commandcodeMcpDefect(
  profile: "commandcode-json" | "mcp-json",
  declared: string | undefined,
  hasCommand: boolean,
  hasUrl: boolean,
): McpFact["commandcodeDefect"] {
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
  io: ScanIO,
  profile: McpSchemaProfile,
): McpFact[] {
  if (!isRecord(raw)) {
    reportRootShapeOnce(filePath, io, "MCP config root is not an object");
    return [];
  }
  const obj = raw as Record<string, unknown>;
  const servers = serversFromObject(obj, profile, filePath, io);
  if (servers === undefined) {
    return [];
  }

  const facts: McpFact[] = [];
  const sourceProvider = MCP_PROFILES[profile].sourceProvider;
  const consumedBy = [...MCP_PROFILES[profile].consumedBy];
  for (const [name, value] of Object.entries(servers)) {
    const secretLabel = secretLabelOf(JSON.stringify(value));
    let hasUrl = false;
    let hasServerUrl = false;
    let hasHttpUrl = false;
    let transport: string | undefined;
    let transportField: McpFact["transportField"];
    let literalEnvKeys: string[] = [];
    let literalCredentialFields: string[] = [];
    let uses: string | undefined;
    let commandVariants: ReturnType<typeof commandFactsFromEntry> = [{ hasCommand: false }];
    if (isRecord(value)) {
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
      const defect =
        profile === "commandcode-json"
          ? commandcodeMcpDefect(profile, transport, hasCommand, hasUrl)
          : undefined;
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
        ...(secretLabel === undefined ? {} : { secretLabel }),
      });
    }
  }
  return facts;
}

function mcpKey(fact: McpFact): string {
  const platform = fact.platform === undefined ? "" : `:${fact.platform}`;
  const layer = fact.claudeMcpLayer === undefined ? "" : `:${fact.claudeMcpLayer}`;
  return `${fact.name}@${fact.path}${platform}${layer}`;
}

/** Push each fact of `batch` whose server key is not in `seen` yet; first one wins. */
export function addUniqueMcp(out: McpFact[], seen: Set<string>, batch: McpFact[]): void {
  for (const fact of batch) {
    const key = mcpKey(fact);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(fact);
  }
}

function withClaudeMcpLayer(facts: McpFact[], layer: NonNullable<McpFact["claudeMcpLayer"]>): McpFact[] {
  return facts.map((fact) => ({ ...fact, claudeMcpLayer: layer }));
}

function claudeMcpServersFromValue(
  servers: unknown,
  filePath: string,
  root: string,
  io: ScanIO,
  detail: string,
): McpFact[] {
  if (!isRecord(servers)) {
    io.errors.push({
      path: filePath,
      kind: "unexpected-shape",
      detail,
    });
    return [];
  }
  return parseMcpServers(
    { mcpServers: servers as Record<string, unknown> },
    filePath,
    root,
    io,
    "claude-json",
  );
}

/** `~/.claude.json` project keys compare as `/`-separated paths without a trailing slash. */
function claudeProjectKey(path: string): string {
  const trimmed = toPosix(path).replace(/\/+$/, "");
  return trimmed.length === 0 ? "/" : trimmed;
}

function localMcpFromProjects(
  projects: unknown,
  filePath: string,
  root: string,
  projectPaths: string[],
  io: ScanIO,
): McpFact[] {
  if (!isRecord(projects)) {
    return [];
  }
  const wanted = new Set(
    projectPaths.map((path) => claudeProjectKey(resolve(path))),
  );
  const facts: McpFact[] = [];
  for (const [key, value] of Object.entries(projects as Record<string, unknown>)) {
    if (!wanted.has(claudeProjectKey(resolve(key)))) {
      continue;
    }
    if (!isRecord(value)) {
      continue;
    }
    const servers = (value as Record<string, unknown>).mcpServers;
    if (servers === undefined) {
      continue;
    }
    facts.push(
      ...withClaudeMcpLayer(
        claudeMcpServersFromValue(
          servers,
          filePath,
          root,
          io,
          "`projects.*.mcpServers` is not an object",
        ),
        "local",
      ),
    );
  }
  return facts;
}

/**
 * `mcpServers` from `~/.claude.json`. Absent top-level `mcpServers` is not
 * an error — the file also holds session and per-project state.
 * Local-scope servers live at `projects.<abs-path>.mcpServers` and are
 * read only for the scanned project paths.
 * Never pass the raw root to `parseMcpServers` / `parseMcpFile`.
 * See docs/spec/mcp.md.
 */
function parseClaudeUserJsonMcp(
  raw: unknown,
  filePath: string,
  root: string,
  io: ScanIO,
  projectPaths: string[] = [],
): McpFact[] {
  if (!isRecord(raw)) {
    io.errors.push({
      path: filePath,
      kind: "unexpected-shape",
      detail: "Claude user config is not a JSON object",
    });
    return [];
  }
  const obj = raw as Record<string, unknown>;
  const facts: McpFact[] = [];
  if (obj.mcpServers !== undefined) {
    facts.push(
      ...withClaudeMcpLayer(
        claudeMcpServersFromValue(
          obj.mcpServers,
          filePath,
          root,
          io,
          "`mcpServers` is not an object",
        ),
        "user",
      ),
    );
  }
  facts.push(...localMcpFromProjects(obj.projects, filePath, root, projectPaths, io));
  return facts;
}

/**
 * User and local MCP at `~/.claude.json`. Only called under `--global`.
 * See docs/spec/mcp.md.
 */
export function discoverClaudeUserMcp(
  io: ScanIO,
  projectPaths: string[] = [],
): McpFact[] {
  const home = homedir();
  const filePath = join(home, ".claude.json");
  const raw = readConfigFile(filePath, io, { optional: true });
  if (raw === undefined) {
    return [];
  }
  return parseClaudeUserJsonMcp(raw, filePath, home, io, projectPaths);
}

export function parseClaudePluginMcpFile(
  filePath: string,
  root: string,
  io: ScanIO,
): McpFact[] {
  const raw = readConfigFile(filePath, io, { optional: true });
  if (raw === undefined) {
    return [];
  }
  if (!isRecord(raw)) {
    io.errors.push({
      path: filePath,
      kind: "unexpected-shape",
      detail: "plugin MCP config is not a JSON object",
    });
    return [];
  }
  const servers = (raw as Record<string, unknown>).mcpServers;
  if (servers === undefined) {
    return [];
  }
  return claudeMcpServersFromValue(
    servers,
    filePath,
    root,
    io,
    "`mcpServers` is not an object",
  );
}

export function parseInlineCommandcodeMcp(
  mcpValue: unknown,
  filePath: string,
  root: string,
  io: ScanIO,
): McpFact[] {
  if (mcpValue === undefined) {
    return [];
  }
  if (!isRecord(mcpValue)) {
    io.errors.push({
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
      if (!isRecord(item)) {
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
    return parseMcpServers({ mcpServers: map }, filePath, root, io, "commandcode-json").map(
      (fact) =>
        unnamed.has(fact.name)
          ? { ...fact, inventoryOnly: true, commandcodeDefect: undefined }
          : fact,
    );
  }
  if (isRecord(servers)) {
    return parseMcpServers(
      { mcpServers: servers },
      filePath,
      root,
      io,
      "commandcode-json",
    );
  }
  io.errors.push({
    path: filePath,
    kind: "unexpected-shape",
    detail: "`mcp.servers` is not an array or object",
  });
  return [];
}

function parseTomlMcpServers(
  raw: unknown,
  filePath: string,
  root: string,
  io: ScanIO,
  profile: Extract<McpSchemaProfile, "codex-toml" | "grok-toml">,
): McpFact[] {
  const owner = profile === "codex-toml" ? "Codex" : "Grok";
  if (!isRecord(raw)) {
    io.errors.push({
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
  if (!isRecord(servers)) {
    io.errors.push({
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
    io,
    profile,
  );
}

export function parseCodexTomlFile(
  filePath: string,
  root: string,
  io: ScanIO,
  opts: { optional?: boolean } = {},
): McpFact[] {
  const raw = readConfigFile(filePath, io, opts);
  if (raw === undefined) {
    return [];
  }
  return parseTomlMcpServers(raw, filePath, root, io, "codex-toml");
}

export function parseGrokTomlFile(
  filePath: string,
  root: string,
  io: ScanIO,
  opts: { optional?: boolean } = {},
): McpFact[] {
  const raw = readConfigFile(filePath, io, opts);
  if (raw === undefined) {
    return [];
  }
  return parseTomlMcpServers(raw, filePath, root, io, "grok-toml");
}

export function parseWindsurfJsonFile(
  filePath: string,
  root: string,
  io: ScanIO,
  opts: { optional?: boolean } = {},
): McpFact[] {
  const raw = readConfigFile(filePath, io, opts);
  if (raw === undefined) {
    return [];
  }
  return parseMcpServers(raw, filePath, root, io, "windsurf-json");
}

function parseOpenCode(
  raw: unknown,
  filePath: string,
  root: string,
  io: ScanIO,
): McpFact[] {
  if (!isRecord(raw)) {
    io.errors.push({
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
  if (!isRecord(mcp)) {
    io.errors.push({
      path: filePath,
      kind: "unexpected-shape",
      detail: "`mcp` is not an object",
    });
    return [];
  }
  const table = mcp as Record<string, unknown>;
  const v2 = table.servers;
  if (v2 !== undefined) {
    if (!isRecord(v2)) {
      io.errors.push({
        path: filePath,
        kind: "unexpected-shape",
        detail: "`mcp.servers` is not an object",
      });
      return [];
    }
    const servers = normalizeOpenCodeServers(v2);
    return annotateOpenCode(
      parseMcpServers({ mcpServers: servers }, filePath, root, io, "opencode-json"),
      servers,
      "v2",
    );
  }
  const v1: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(table)) {
    if (name === "timeout") {
      continue;
    }
    if (isRecord(value)) {
      v1[name] = value;
    }
  }
  const servers = normalizeOpenCodeServers(v1);
  return annotateOpenCode(
    parseMcpServers({ mcpServers: servers }, filePath, root, io, "opencode-json"),
    servers,
    "v1",
  );
}

function classifyOpenCodeEntry(
  entry: Record<string, unknown>,
  schema: "v1" | "v2",
): Pick<McpFact, "opencodeSchema" | "opencodeInherit" | "opencodeDefect"> {
  const type = typeof entry.type === "string" ? entry.type : undefined;
  const hasCommand = launchesFromEntry(entry).length > 0;
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
      isRecord(raw)
        ? (raw as Record<string, unknown>)
        : {};
    return { ...fact, ...classifyOpenCodeEntry(entry, schema) };
  });
}

function normalizeOpenCodeServers(servers: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!isRecord(servers)) {
    return out;
  }
  for (const [name, value] of Object.entries(servers as Record<string, unknown>)) {
    if (!isRecord(value)) {
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
    if (!isRecord(item)) {
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
  io: ScanIO,
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
      io,
      "continue-yaml",
    );
  }
  if (!isRecord(raw)) {
    io.errors.push({
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
        io,
        "continue-yaml",
      ),
      obj,
    );
  }
  if (list !== undefined) {
    io.errors.push({
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
      parseMcpServers({ mcpServers: { [name]: obj } }, filePath, root, io, "continue-yaml"),
      obj,
    );
  }
  return [];
}

function isContinueStandaloneYaml(filePath: string): boolean {
  const normalized = toPosix(filePath);
  if (!normalized.includes("/.continue/mcpServers/")) {
    return false;
  }
  return /\.ya?ml$/i.test(normalized);
}

function continueMcpFilename(name: string): boolean {
  return /\.(ya?ml|jsonc?)$/i.test(name) && !name.startsWith(".");
}

export function parseMcpFile(
  filePath: string,
  root: string,
  io: ScanIO,
  opts: { optional?: boolean } = {},
): McpFact[] {
  const profile = mcpProfileFromPath(filePath);
  if (profile === "grok-toml") {
    return parseGrokTomlFile(filePath, root, io, opts);
  }
  const raw = readConfigFile(filePath, io, opts);
  if (raw === undefined) {
    return [];
  }
  if (profile === "codex-toml") {
    return parseTomlMcpServers(raw, filePath, root, io, "codex-toml");
  }
  if (profile === "continue-yaml") {
    return parseContinueDocument(raw, filePath, root, io);
  }
  if (profile === "opencode-json") {
    return parseOpenCode(raw, filePath, root, io);
  }
  return parseMcpServers(raw, filePath, root, io, profile);
}

function discoverContinueMcpDir(
  dir: string,
  root: string,
  io: ScanIO,
  seen: Set<string>,
): McpFact[] {
  const facts: McpFact[] = [];
  for (const { name } of listDir(dir, io) ?? []) {
    if (!continueMcpFilename(name)) {
      continue;
    }
    const filePath = join(dir, name);
    if (isDirectory(filePath)) {
      continue;
    }
    addUniqueMcp(facts, seen, parseMcpFile(filePath, root, io));
  }
  return facts;
}

/** User Gemini MCP. Only called under `--global`. Settings and `mcp_config.json` together. */
export function discoverGeminiUserMcp(root: string, io: ScanIO): McpFact[] {
  const home = providerHome("gemini");
  return [join(home, "settings.json"), join(home, "config", "mcp_config.json")].flatMap((path) =>
    parseMcpFile(path, root, io, { optional: true }),
  );
}

export function discoverMcpSurface(
  root: string,
  mcpPaths: string[],
  io: ScanIO,
): McpFact[] {
  const facts: McpFact[] = [];
  const seen = new Set<string>();
  for (const rel of mcpPaths) {
    const filePath = isAbsolute(rel) ? rel : join(root, rel);
    if (toPosix(rel).endsWith(".continue/mcpServers") && isDirectory(filePath)) {
      facts.push(...discoverContinueMcpDir(filePath, root, io, seen));
      continue;
    }
    addUniqueMcp(facts, seen, parseMcpFile(filePath, root, io, { optional: true }));
  }
  return facts;
}

export function discoverNestedContinueMcp(root: string, io: ScanIO): McpFact[] {
  const facts: McpFact[] = [];
  const seen = new Set<string>();
  for (const abs of walkFiles(root, {
    maxDepth: NESTED_DISCOVERY_MAX_DEPTH,
    match: (path, name) =>
      toPosix(path).includes("/.continue/mcpServers/") && continueMcpFilename(name),
    io,
  })) {
    addUniqueMcp(facts, seen, parseMcpFile(abs, root, io));
  }
  return facts;
}
