import { homedir } from "node:os";
import { join } from "node:path";
import type { McpFact } from "../facts/types";
import type { ScanIO } from "./fs";
import { parseProfiledMcpFile } from "./mcp";

/** Zed MCP servers live under `context_servers` in its settings. See docs/spec/zed-mcp.md. */
function zedSettingsMcp(path: string, root: string, io: ScanIO): McpFact[] {
  return parseProfiledMcpFile(path, root, io, "zed-json", { optional: true, serversKey: "context_servers" });
}

/** Project `.zed/settings.json`. Zed applies it only in a trusted worktree; agentscan reads it regardless. */
export function discoverZedProjectMcp(dir: string, io: ScanIO): McpFact[] {
  return zedSettingsMcp(join(dir, ".zed", "settings.json"), dir, io);
}

/**
 * User settings, `--global` only. Windows `%APPDATA%\Zed\settings.json`, else `~/.config/zed/settings.json`.
 * shortcut: `$XDG_CONFIG_HOME/zed` is not read; add it if a user reports a relocated config.
 */
export function discoverZedUserMcp(root: string, io: ScanIO): McpFact[] {
  const appData = process.env.APPDATA;
  const path =
    process.platform === "win32" && appData !== undefined
      ? join(appData, "Zed", "settings.json")
      : join(homedir(), ".config", "zed", "settings.json");
  return zedSettingsMcp(path, root, io);
}
