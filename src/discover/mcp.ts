import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import type { ConfigErrorFact, McpFact } from "../facts/types";
import { readJsonConfig } from "./shared";

/** Anything that makes the command a shell program rather than one path. */
const SHELL_METACHARS = /[|;&`]|\$\(|\|\||&&|\s/;

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
  // Relative path with a slash (`bin/server`) is checkable; bare names are not.
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
    // Executables are files; a directory at the command path cannot be launched.
    return { command: extracted, exists: statSync(abs).isFile() };
  } catch {
    return { command: extracted, exists: false };
  }
}

function parseMcpServers(
  raw: unknown,
  filePath: string,
  root: string,
  errors: ConfigErrorFact[],
): McpFact[] {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    errors.push({
      path: filePath,
      kind: "unexpected-shape",
      detail: "MCP config root is not a JSON object",
    });
    return [];
  }
  const obj = raw as Record<string, unknown>;
  let servers: Record<string, unknown>;
  if (
    "mcpServers" in obj &&
    obj.mcpServers !== null &&
    typeof obj.mcpServers === "object" &&
    !Array.isArray(obj.mcpServers)
  ) {
    servers = obj.mcpServers as Record<string, unknown>;
  } else if (
    !("mcpServers" in obj) &&
    Object.keys(obj).length > 0 &&
    // Every value must look like a server entry. Without this a wrapper key —
    // the VS Code `servers` spelling, or `inputs` — becomes a phantom server
    // reported as having no command, while the real servers under it are never
    // inspected.
    Object.values(obj).every(
      (v) =>
        v !== null &&
        typeof v === "object" &&
        !Array.isArray(v) &&
        ("command" in v || "url" in v || "type" in v),
    )
  ) {
    servers = obj;
  } else {
    errors.push({
      path: filePath,
      kind: "unexpected-shape",
      detail: "no usable `mcpServers` object and the root is not a server map",
    });
    return [];
  }

  const facts: McpFact[] = [];
  for (const [name, value] of Object.entries(servers)) {
    let hasCommand = false;
    let hasUrl = false;
    let command: string | undefined;
    let commandExists: boolean | undefined;
    let transport: string | undefined;
    const literalEnvKeys: string[] = [];
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const entry = value as Record<string, unknown>;
      hasCommand =
        typeof entry.command === "string" && entry.command.length > 0;
      if (typeof entry.command === "string" && entry.command.length > 0) {
        command = entry.command;
        const resolved = resolveMcpCommand(root, entry.command);
        if (resolved !== undefined) {
          commandExists = resolved.exists;
        }
      }
      hasUrl = typeof entry.url === "string" && entry.url.length > 0;
      if (typeof entry.type === "string" && entry.type.length > 0) {
        transport = entry.type;
      }
      const env = entry.env;
      if (env !== null && typeof env === "object" && !Array.isArray(env)) {
        for (const [key, val] of Object.entries(env as Record<string, unknown>)) {
          // Gate on the key, not the value length. PATH, NODE_OPTIONS and
          // LOG_FORMAT are all long and none is a secret — the same "narrow, no
          // entropy guessing" principle SECRET_PATTERNS commits to.
          if (
            typeof val === "string" &&
            val.length > 0 &&
            !/\$\{[A-Za-z_][A-Za-z0-9_]*(?::-[^}]*)?\}/.test(val) &&
            /(?:TOKEN|SECRET|KEY|PASSWORD|PASSWD|CREDENTIAL)S?$/i.test(key)
          ) {
            literalEnvKeys.push(key);
          }
        }
      }
    }
    facts.push({
      name,
      path: filePath,
      hasCommand,
      hasUrl,
      ...(command === undefined ? {} : { command }),
      ...(commandExists === undefined ? {} : { commandExists }),
      ...(transport === undefined ? {} : { transport }),
      literalEnvKeys,
      raw: JSON.stringify(value),
    });
  }
  return facts;
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
    const raw = readJsonConfig(filePath, errors);
    if (raw === undefined) {
      continue;
    }
    for (const fact of parseMcpServers(raw, filePath, root, errors)) {
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
