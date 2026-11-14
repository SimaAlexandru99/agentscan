import { homedir } from "node:os";
import { join } from "node:path";
import type { ClaudeDesktopExtensionFact, McpFact } from "../facts/types";
import { isRecord, listDir, readConfigFile, type ScanIO } from "./fs";
import { parseProfiledMcpFile } from "./mcp";

/** Per-OS user config dir. See docs/spec/claude-desktop-mcp.md. */
export function claudeDesktopConfigDir(): string {
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "Claude");
  }
  const appData = process.env.APPDATA;
  if (process.platform === "win32" && appData !== undefined) {
    return join(appData, "Claude");
  }
  return join(homedir(), ".config", "Claude");
}

/** `mcpServers` in `claude_desktop_config.json`. `--global` only; other top-level keys are ignored. */
export function discoverClaudeDesktopMcp(root: string, io: ScanIO): McpFact[] {
  return parseProfiledMcpFile(join(claudeDesktopConfigDir(), "claude_desktop_config.json"), root, io, "claude-desktop-json", {
    optional: true,
    mcpServersOptional: true,
  });
}

const REQUIRED = ["manifest_version", "name", "version", "description", "author", "server"] as const;
const SERVER_TYPES = new Set(["node", "python", "binary", "uv"]);

function present(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

/** Required-field defects of one parsed MCPB manifest. Unknown keys and the version value are not checked. */
export function manifestDefects(raw: Record<string, unknown>): Omit<ClaudeDesktopExtensionFact, "path"> {
  const missingFields: string[] = REQUIRED.filter((key) => !present(raw[key]));
  if (present(raw.author) && !(isRecord(raw.author) && present(raw.author.name))) {
    missingFields.push("author.name");
  }
  const type = isRecord(raw.server) ? raw.server.type : undefined;
  return {
    missingFields,
    ...(typeof type === "string" && !SERVER_TYPES.has(type) ? { unknownServerType: type } : {}),
  };
}

/**
 * Installed extensions, `Claude Extensions/<id>/manifest.json` beside the config. `--global` only.
 * That install location comes from a third-party source, not the MCPB spec (see the capture's Unverified list).
 */
export function discoverClaudeDesktopExtensions(io: ScanIO): ClaudeDesktopExtensionFact[] {
  const dir = join(claudeDesktopConfigDir(), "Claude Extensions");
  const out: ClaudeDesktopExtensionFact[] = [];
  for (const entry of listDir(dir, io, { optional: true }) ?? []) {
    if (!entry.isDirectory()) {
      continue;
    }
    const path = join(dir, entry.name, "manifest.json");
    const raw = readConfigFile(path, io, { optional: true });
    if (!isRecord(raw)) {
      continue;
    }
    const defects = manifestDefects(raw);
    if (defects.missingFields.length > 0 || defects.unknownServerType !== undefined) {
      out.push({ path, ...defects });
    }
  }
  return out;
}
