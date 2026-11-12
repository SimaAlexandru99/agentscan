import { isAbsolute, join } from "node:path";
import { mcpProfileFromPath } from "../facts/provider";
import { providerHome } from "../facts/providers";
import type { McpFact } from "../facts/types";
import { isRecord, readConfigFile, type ScanIO } from "./fs";
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

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

