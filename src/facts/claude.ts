import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Claude Code user config directory.
 * Quoted settings page: set `CLAUDE_CONFIG_DIR` to keep home-directory files
 * (`settings`, skills, agents, `CLAUDE.md`, rules) somewhere other than
 * `~/.claude`. `~/.claude.json` stays in the home directory — the page names
 * that file separately and does not give a relocated path.
 * See docs/spec/hook-sources.md and docs/spec/claude-memory.md.
 */
export function claudeConfigDir(): string {
  const override = process.env.CLAUDE_CONFIG_DIR?.trim();
  if (override !== undefined && override.length > 0) {
    return override;
  }
  return join(homedir(), ".claude");
}

/** Normalize a `~/.claude.json` `projects` key against a scanned root. */
export function normalizeClaudeProjectKey(path: string): string {
  const trimmed = path.replaceAll("\\", "/").replace(/\/+$/, "");
  return trimmed.length === 0 ? "/" : trimmed;
}
