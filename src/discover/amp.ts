import { existsSync } from "node:fs";
import { join } from "node:path";
import { providerHome } from "../facts/providers";
import type { McpFact } from "../facts/types";
import type { ScanIO } from "./fs";
import { parseProfiledMcpFile } from "./mcp";

/** `settings.json`, else `settings.jsonc`, in `dir`. */
function settingsIn(dir: string): string | undefined {
  return ["settings.json", "settings.jsonc"].map((name) => join(dir, name)).find((path) => existsSync(path));
}

/** Amp keeps servers under the literal top-level key `amp.mcpServers`. See docs/spec/amp-mcp.md. */
function ampSettingsMcp(path: string | undefined, root: string, io: ScanIO): McpFact[] {
  return path === undefined
    ? []
    : parseProfiledMcpFile(path, root, io, "amp-json", { optional: true, serversKey: "amp.mcpServers" });
}

/** Workspace settings: only the nearest `.amp/settings.json(c)` from `dirs` (nearest first). */
export function discoverAmpProjectMcp(dirs: string[], io: ScanIO): McpFact[] {
  for (const dir of dirs) {
    const path = settingsIn(join(dir, ".amp"));
    if (path !== undefined) {
      return ampSettingsMcp(path, dir, io);
    }
  }
  return [];
}

/** User `~/.config/amp/settings.json(c)`. `--global` only. */
export function discoverAmpUserMcp(root: string, io: ScanIO): McpFact[] {
  return ampSettingsMcp(settingsIn(providerHome("amp")), root, io);
}
