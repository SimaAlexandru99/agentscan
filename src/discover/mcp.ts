import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ConfigErrorFact, McpFact } from "../facts/types";
import { readJsonConfig } from "./shared";

function parseMcpServers(
  raw: unknown,
  filePath: string,
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
    let transport: string | undefined;
    const literalEnvKeys: string[] = [];
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const entry = value as Record<string, unknown>;
      hasCommand =
        typeof entry.command === "string" && entry.command.length > 0;
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
    for (const fact of parseMcpServers(raw, filePath, errors)) {
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
