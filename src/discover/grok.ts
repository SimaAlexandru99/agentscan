import { dirname, join, resolve } from "node:path";
import { applyPrecedence } from "../facts/precedence";
import { providerHome } from "../facts/providers";
import type { McpFact } from "../facts/types";
import { parseGrokTomlFile } from "./mcp";
import { hops } from "./scan-context";
import type { ScanIO } from "./fs";

/**
 * User MCP at `$GROK_HOME/config.toml` or `~/.grok/config.toml`.
 * Only called under `--global`. See docs/spec/grok-mcp.md.
 */
export function discoverGrokUserMcp(io: ScanIO): McpFact[] {
  const home = providerHome("grok");
  return parseGrokTomlFile(join(home, "config.toml"), home, io, { optional: true });
}

/**
 * Closer project `.grok/config.toml` wins; any project file beats the user
 * file. Same-name only. See docs/spec/grok-mcp.md.
 */
export function applyGrokMcpPrecedence(mcp: McpFact[], startDir: string): void {
  const userFile = resolve(join(providerHome("grok"), "config.toml"));
  applyPrecedence(
    mcp,
    (entry) => entry.name,
    (entry) => (entry.schemaProfile === "grok-toml" ? grokMcpScore(entry, startDir, userFile) : undefined),
  );
}

function grokMcpScore(entry: McpFact, startDir: string, userFile: string): number {
  if (resolve(entry.path) === userFile) {
    return 0;
  }
  const projectDir = dirname(dirname(entry.path));
  return 1_000 - hops(startDir, projectDir);
}
