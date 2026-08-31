import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ConfigErrorFact, McpFact, RuleFact } from "../facts/types";
import { parseWindsurfJsonFile } from "./mcp";
import { discoverWindsurfGlobalRules as readGlobalRules } from "./rules";

/**
 * Cascade user MCP. Only called under `--global`.
 * See docs/spec/windsurf-mcp.md.
 */
export function windsurfUserMcpPath(home = homedir()): string {
  return join(home, ".codeium", "windsurf", "mcp_config.json");
}

/**
 * Quoted global rules file. Only called under `--global`.
 * See docs/spec/windsurf-rules.md.
 */
export function windsurfGlobalRulesPath(home = homedir()): string {
  return join(home, ".codeium", "windsurf", "memories", "global_rules.md");
}

export function discoverWindsurfUserMcp(errors: ConfigErrorFact[]): McpFact[] {
  const filePath = windsurfUserMcpPath();
  if (!existsSync(filePath)) {
    return [];
  }
  return parseWindsurfJsonFile(filePath, dirname(filePath), errors);
}

export function discoverWindsurfUserRules(errors: ConfigErrorFact[]): RuleFact[] {
  return readGlobalRules(windsurfGlobalRulesPath(), errors);
}
