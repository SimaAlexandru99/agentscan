/** Official Grok Build values. See docs/spec/grok-*.md (read 2026-08-31). */

import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Quoted event table on https://docs.x.ai/build/features/hooks (read 2026-08-31).
 */
export const GROK_HOOK_EVENTS = new Set([
  "SessionStart",
  "SessionEnd",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "PermissionDenied",
  "Stop",
  "StopFailure",
  "Notification",
  "SubagentStart",
  "SubagentStop",
  "PreCompact",
  "PostCompact",
]);

/** Quoted: type is "command" or "http". */
export const GROK_HOOK_HANDLER_TYPES = new Set(["command", "http"]);

/**
 * Settings page: `$GROK_HOME/config.toml`, or `~/.grok/config.toml` when unset.
 * Never used to open credential files.
 */
export function grokHomeDir(): string {
  const override = process.env.GROK_HOME?.trim();
  if (override !== undefined && override.length > 0) {
    return override;
  }
  return join(homedir(), ".grok");
}

/** Shadowed Grok MCP is inventoried but is not currently loaded. */
export function isShadowedGrok(effective: boolean | undefined): boolean {
  return effective === false;
}
