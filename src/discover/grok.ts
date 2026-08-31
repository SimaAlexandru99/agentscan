import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { grokHomeDir } from "../facts/grok";
import type { ConfigErrorFact, McpFact } from "../facts/types";
import { parseGrokTomlFile } from "./mcp";
import { hopsFrom } from "./shared";

/**
 * User MCP at `$GROK_HOME/config.toml` or `~/.grok/config.toml`.
 * Only called under `--global`. See docs/spec/grok-mcp.md.
 */
export function discoverGrokUserMcp(errors: ConfigErrorFact[]): McpFact[] {
  const home = grokHomeDir();
  const filePath = join(home, "config.toml");
  if (!existsSync(filePath)) {
    return [];
  }
  return parseGrokTomlFile(filePath, home, errors);
}

/**
 * Closer project `.grok/config.toml` wins; any project file beats the user
 * file. Same-name only. See docs/spec/grok-mcp.md.
 */
export function applyGrokMcpPrecedence(mcp: McpFact[], startDir: string): void {
  const userFile = resolve(join(grokHomeDir(), "config.toml"));
  const ranked: { entry: McpFact; score: number }[] = [];
  for (const entry of mcp) {
    if (entry.schemaProfile !== "grok-toml") {
      continue;
    }
    ranked.push({ entry, score: grokMcpScore(entry, startDir, userFile) });
  }
  const best = new Map<string, number>();
  for (const item of ranked) {
    const current = best.get(item.entry.name);
    if (current === undefined || item.score > current) {
      best.set(item.entry.name, item.score);
    }
  }
  const seenWinner = new Set<string>();
  for (const item of ranked) {
    const winning = best.get(item.entry.name) ?? item.score;
    if (item.score === winning && !seenWinner.has(item.entry.name)) {
      item.entry.grokEffective = true;
      seenWinner.add(item.entry.name);
    } else {
      item.entry.grokEffective = false;
    }
  }
}

function grokMcpScore(entry: McpFact, startDir: string, userFile: string): number {
  if (resolve(entry.path) === userFile) {
    return 0;
  }
  const projectDir = dirname(dirname(entry.path));
  return 1_000 - hopsFrom(startDir, projectDir);
}
