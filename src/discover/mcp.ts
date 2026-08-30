import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { parse as parseToml } from "smol-toml";
import {
  mcpProfileFromPath,
  sourceProviderForMcpProfile,
  type McpSchemaProfile,
} from "../facts/provider";
import type { ConfigErrorFact, McpFact } from "../facts/types";
import { parseJsonc } from "./jsonc";
import { readJsonConfig } from "./shared";

/** Anything that makes the command a shell program rather than one path. */
const SHELL_METACHARS = /[|;&`]|\$\(|\|\||&&|\s/;

const INTERPOLATED =
  /\$\{[A-Za-z_][A-Za-z0-9_]*(?::-[^}]*)?\}|\$\{env:[A-Za-z_][A-Za-z0-9_]*\}|\$\{input:[A-Za-z0-9_-]+\}|\$\{(?:userHome|workspaceFolder|workspaceFolderBasename|pathSeparator|\/)\}/;

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
    return /^\$(?:CLAUDE_PROJECT_DIR\b|\{CLAUDE_PROJECT_DIR\})/.test(trimmed)
      ? trimmed
      : undefined;
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
      /^\$(?:CLAUDE_PROJECT_DIR|\{CLAUDE_PROJECT_DIR\})\/?/,
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

function commandFromEntry(
  entry: Record<string, unknown>,
  root: string,
): { hasCommand: boolean; command?: string; commandExists?: boolean } {
  const raw = entry.command;
  if (typeof raw === "string" && raw.length > 0) {
    const resolved = resolveMcpCommand(root, raw);
    return {
      hasCommand: true,
      command: raw,
      ...(resolved === undefined ? {} : { commandExists: resolved.exists }),
    };
  }
  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === "string" && raw[0].length > 0) {
    const first = raw[0];
    const resolved = resolveMcpCommand(root, first);
    return {
      hasCommand: true,
      command: first,
      ...(resolved === undefined ? {} : { commandExists: resolved.exists }),
    };
  }
  return { hasCommand: false };
}

function literalEnvKeysFrom(entry: Record<string, unknown>): string[] {
  const env = entry.env;
  if (env === null || typeof env !== "object" || Array.isArray(env)) {
    return [];
  }
  const keys: string[] = [];
  for (const [key, val] of Object.entries(env as Record<string, unknown>)) {
    if (
      typeof val === "string" &&
      val.length > 0 &&
      !INTERPOLATED.test(val) &&
      /(?:TOKEN|SECRET|KEY|PASSWORD|PASSWD|CREDENTIAL)S?$/i.test(key)
    ) {
      keys.push(key);
    }
  }
  return keys;
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
  return "command" in entry || "url" in entry || "type" in entry || "serverUrl" in entry;
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
  for (const [name, value] of Object.entries(servers)) {
    let hasUrl = false;
    let hasServerUrl = false;
    let command: string | undefined;
    let commandExists: boolean | undefined;
    let hasCommand = false;
    let transport: string | undefined;
    let literalEnvKeys: string[] = [];
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const entry = value as Record<string, unknown>;
      const parsedCommand = commandFromEntry(entry, root);
      hasCommand = parsedCommand.hasCommand;
      command = parsedCommand.command;
      commandExists = parsedCommand.commandExists;
      hasUrl = typeof entry.url === "string" && entry.url.length > 0;
      hasServerUrl =
        typeof entry.serverUrl === "string" && entry.serverUrl.length > 0;
      if (typeof entry.type === "string" && entry.type.length > 0) {
        transport = entry.type;
      }
      literalEnvKeys = literalEnvKeysFrom(entry);
    }
    facts.push({
      name,
      path: filePath,
      schemaProfile: profile,
      sourceProvider,
      hasCommand,
      hasUrl,
      ...(hasServerUrl ? { hasServerUrl: true } : {}),
      ...(command === undefined ? {} : { command }),
      ...(commandExists === undefined ? {} : { commandExists }),
      ...(transport === undefined ? {} : { transport }),
      literalEnvKeys,
      raw: JSON.stringify(value),
    });
  }
  return facts;
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

function parseCodexToml(
  raw: unknown,
  filePath: string,
  root: string,
  errors: ConfigErrorFact[],
): McpFact[] {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    errors.push({
      path: filePath,
      kind: "unexpected-shape",
      detail: "Codex config root is not a TOML table",
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
    "codex-toml",
  );
}

export function discoverMcp(
  root: string,
  mcpPaths: string[],
  errors: ConfigErrorFact[],
): McpFact[] {
  const facts: McpFact[] = [];
  const seen = new Set<string>();
  for (const rel of mcpPaths) {
    const filePath = join(root, rel);
    if (!existsSync(filePath)) {
      continue;
    }
    const profile = mcpProfileFromPath(filePath);
    let raw: unknown | undefined;
    if (profile === "codex-toml") {
      raw = readTomlConfig(filePath, errors);
      if (raw === undefined) {
        continue;
      }
      for (const fact of parseCodexToml(raw, filePath, root, errors)) {
        const key = `${fact.name}@${fact.path}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        facts.push(fact);
      }
      continue;
    }
    raw =
      profile === "vscode-json" || profile === "cursor-json"
        ? readVscodeConfig(filePath, errors)
        : readJsonConfig(filePath, errors);
    if (raw === undefined) {
      continue;
    }
    for (const fact of parseMcpServers(raw, filePath, root, errors, profile)) {
      const key = `${fact.name}@${fact.path}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      facts.push(fact);
    }
  }
  return facts;
}
