import { join } from "node:path";
import { providerHome } from "../facts/providers";
import type { HookFact, McpFact } from "../facts/types";
import { hooksFromObject, readHooksDocument, readHooksFile } from "./hooks";
import { parseProfiledMcpFile } from "./mcp";
import type { ScanIO } from "./fs";

const SETTINGS_HOOKS = {
  source: "settings" as const,
  sourceProvider: "devin" as const,
  profile: "devin" as const,
};

/**
 * `.devin/hooks.v1.json` is the hooks object itself: no `"hooks"` wrapper.
 * See docs/spec/devin-hooks.md.
 */
function discoverDevinV1Hooks(filePath: string, projectRoot: string, io: ScanIO): HookFact[] {
  const doc = readHooksDocument(filePath, io);
  if (doc === undefined) {
    return [];
  }
  return hooksFromObject(
    doc,
    filePath,
    "devin-hooks",
    { project: projectRoot },
    io,
    { sourceProvider: "devin", schemaProfile: "devin" },
  );
}

function discoverDevinSettingsHooks(filePath: string, projectRoot: string, io: ScanIO): HookFact[] {
  return readHooksFile(filePath, SETTINGS_HOOKS, { project: projectRoot }, io);
}

function discoverDevinMcpFiles(dir: string, projectRoot: string, io: ScanIO): McpFact[] {
  return [
    ...parseProfiledMcpFile(join(dir, "config.json"), projectRoot, io, "devin-json", {
      optional: true,
      mcpServersOptional: true,
    }),
    ...parseProfiledMcpFile(join(dir, "config.local.json"), projectRoot, io, "devin-json", {
      optional: true,
      mcpServersOptional: true,
    }),
    ...parseProfiledMcpFile(join(dir, "mcp_config.json"), projectRoot, io, "devin-json", {
      optional: true,
    }),
    ...parseProfiledMcpFile(join(dir, "mcp_config.local.json"), projectRoot, io, "devin-json", {
      optional: true,
    }),
  ];
}

/** Project `.devin/` hooks and MCP. Called once per walk-up directory. */
export function discoverDevinProject(dir: string, io: ScanIO): { hooks: HookFact[]; mcp: McpFact[] } {
  const root = join(dir, ".devin");
  return {
    hooks: [
      ...discoverDevinV1Hooks(join(root, "hooks.v1.json"), dir, io),
      ...discoverDevinSettingsHooks(join(root, "config.json"), dir, io),
      ...discoverDevinSettingsHooks(join(root, "config.local.json"), dir, io),
    ],
    mcp: discoverDevinMcpFiles(root, dir, io),
  };
}

/**
 * User `~/.config/devin/`. Only called under `--global`.
 * Relative hook scripts resolve against the scanned project, not the home dir.
 */
export function discoverDevinUser(projectRoot: string, io: ScanIO): { hooks: HookFact[]; mcp: McpFact[] } {
  const home = providerHome("devin");
  return {
    hooks: discoverDevinSettingsHooks(join(home, "config.json"), projectRoot, io),
    mcp: discoverDevinMcpFiles(home, projectRoot, io),
  };
}
