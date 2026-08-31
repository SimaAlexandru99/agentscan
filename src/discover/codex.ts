import { existsSync } from "node:fs";
import { join } from "node:path";
import { codexHomeDir } from "../facts/codex";
import type { ConfigErrorFact, McpFact } from "../facts/types";
import { parseCodexTomlFile } from "./mcp";

/**
 * User MCP at `$CODEX_HOME/config.toml` or `~/.codex/config.toml`.
 * Only called under `--global`. See docs/spec/codex-mcp.md.
 * Does not apply `project_doc_*` knobs from the user file.
 */
export function discoverCodexUserMcp(errors: ConfigErrorFact[]): McpFact[] {
  const home = codexHomeDir();
  const filePath = join(home, "config.toml");
  if (!existsSync(filePath)) {
    return [];
  }
  return parseCodexTomlFile(filePath, home, errors);
}
