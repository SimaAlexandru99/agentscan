import { isAbsolute, join } from "node:path";
import { mcpProfileFromPath } from "../facts/provider";
import { providerHome } from "../facts/providers";
import type { HookFact, McpFact } from "../facts/types";
import { isRecord, readConfigFile, reportRootShapeOnce, type ScanIO } from "./fs";
import { hooksFromObject, readHooksFile } from "./hooks";
import { parseCodexTomlFile } from "./mcp";

/**
 * User MCP at `$CODEX_HOME/config.toml` or `~/.codex/config.toml`.
 * Only called under `--global`. See docs/spec/codex-mcp.md.
 * Does not apply `project_doc_*` knobs from the user file.
 */
export function discoverCodexUserMcp(io: ScanIO): McpFact[] {
  const home = providerHome("codex");
  return parseCodexTomlFile(join(home, "config.toml"), home, io, { optional: true });
}

/** Codex `project_doc_max_bytes` default (32 KiB). See docs/spec/codex-agents-md.md. */
export const CODEX_PROJECT_DOC_MAX_BYTES = 32_768;

/** Codex instruction-chain knobs. See docs/spec/codex-agents-md.md. */
export type CodexProjectConfig = {
  projectDocMaxBytes?: number;
  projectDocFallbackFilenames?: string[];
  projectRootMarkers?: string[];
};

/**
 * Codex knobs from the project `config.toml` files on the walk-up: the nearest
 * directory wins per knob, and within one directory a later configured path
 * wins. Read on its own so policy discovery does not depend on the MCP reader
 * running first; the per-scan read cache parses each file once.
 */
export function readCodexProjectConfig(
  dirs: string[],
  mcpPaths: string[],
  io: ScanIO,
): CodexProjectConfig {
  const out: CodexProjectConfig = {};
  for (const dir of dirs) {
    const inDir: CodexProjectConfig = {};
    for (const rel of mcpPaths) {
      const filePath = isAbsolute(rel) ? rel : join(dir, rel);
      if (mcpProfileFromPath(filePath) !== "codex-toml") {
        continue;
      }
      Object.assign(inDir, projectDocSettingsFromToml(readConfigFile(filePath, io, { optional: true })));
    }
    out.projectDocMaxBytes ??= inDir.projectDocMaxBytes;
    out.projectDocFallbackFilenames ??= inDir.projectDocFallbackFilenames;
    out.projectRootMarkers ??= inDir.projectRootMarkers;
  }
  return out;
}

function projectDocSettingsFromToml(raw: unknown): CodexProjectConfig {
  if (!isRecord(raw)) {
    return {};
  }
  const obj = raw as Record<string, unknown>;
  const out: CodexProjectConfig = {};
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

const CODEX_HOOKS_FILE = {
  source: "codex-hooks" as const,
  sourceProvider: "codex" as const,
  profile: "codex" as const,
};

/**
 * `hooks.json` plus inline `[hooks]` in `config.toml`. Both files in one
 * layer are inventoried; a higher layer does not replace a lower one, and
 * this scanner does not model the trust gate. `config.toml` is the same
 * cached parse the MCP reader uses. See docs/spec/codex-hooks.md.
 */
function discoverCodexHookFiles(dir: string, projectRoot: string, io: ScanIO): HookFact[] {
  return [
    ...readHooksFile(join(dir, "hooks.json"), CODEX_HOOKS_FILE, { project: projectRoot }, io),
    ...hooksFromCodexToml(join(dir, "config.toml"), projectRoot, io),
  ];
}

/** Project `.codex/hooks.json` and `.codex/config.toml`. One walk-up directory. */
export function discoverCodexProjectHooks(dir: string, io: ScanIO): HookFact[] {
  return discoverCodexHookFiles(join(dir, ".codex"), dir, io);
}

/**
 * User `hooks.json` and `config.toml` under `$CODEX_HOME` or `~/.codex`.
 * Only called under `--global`. Relative commands resolve against `projectRoot`
 * (the scan root), not the git root.
 */
export function discoverCodexUserHooks(projectRoot: string, io: ScanIO): HookFact[] {
  return discoverCodexHookFiles(providerHome("codex"), projectRoot, io);
}

function hooksFromCodexToml(filePath: string, projectRoot: string, io: ScanIO): HookFact[] {
  const raw = readConfigFile(filePath, io, { optional: true });
  if (raw === undefined) {
    return [];
  }
  if (!isRecord(raw)) {
    reportRootShapeOnce(filePath, io, "Codex config root is not a TOML table");
    return [];
  }
  if (raw.hooks === undefined) {
    return [];
  }
  // `[hooks.state]` is the per-hook trust record Codex writes itself ("Codex records trust against the
  // hook's current hash", codex-hooks.md); it is not an event.
  const hooks = isRecord(raw.hooks) ? Object.fromEntries(Object.entries(raw.hooks).filter(([key]) => key !== "state")) : raw.hooks;
  return hooksFromObject(hooks, filePath, "codex-hooks", { project: projectRoot }, io, {
    sourceProvider: "codex",
    schemaProfile: "codex",
  });
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

