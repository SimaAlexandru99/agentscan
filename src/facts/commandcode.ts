/** Official Command Code values. See docs/spec/commandcode-*.md (read 2026-08-31). */

import type { Provider } from "./provider";

export const COMMANDCODE_HOOK_EVENTS = new Set([
  "PreToolUse",
  "PostToolUse",
  "Stop",
  "SessionStart",
]);

export const COMMANDCODE_HOOK_HANDLER_TYPES = new Set(["command"]);

export const COMMANDCODE_RESERVED_AGENT_NAMES = new Set([
  "explore",
  "plan",
  "review",
  "general",
]);

/**
 * The five documented override values plus `inherit`, which the agents page
 * lists as the field's default (the same way `model` documents `inherit`).
 */
export const COMMANDCODE_PERMISSION_MODES = new Set([
  "default",
  "auto-accept",
  "bypass",
  "plan",
  "dont-ask",
  "inherit",
]);

export const COMMANDCODE_MCP_TRANSPORTS = new Set(["http", "stdio"]);

/**
 * The Command Code MCP page names SSE only in passing ("OAuth works with HTTP
 * and SSE transport servers") and never as a `--transport` value. Skip rather
 * than flag: a false `invalid-transport` on a working server is worse than
 * silence. See docs/spec/commandcode-mcp.md.
 */
export const COMMANDCODE_TOLERATED_MCP_TRANSPORTS = new Set(["sse"]);

/**
 * Claude transports that are valid on the shared `.mcp.json` path.
 * `streamable-http` is a documented alias for `http` (docs/spec/mcp.md).
 */
export const CLAUDE_MCP_TRANSPORTS = new Set(["stdio", "http", "streamable-http", "sse", "ws"]);

export const COMMANDCODE_HOOK_TIMEOUT_MIN = 0;
export const COMMANDCODE_HOOK_TIMEOUT_MAX = 600;

export const COMMANDCODE_PROJECT_DIR =
  /^\$(?:COMMANDCODE_PROJECT_DIR\b|\{COMMANDCODE_PROJECT_DIR\}|COMMANDCODE_CWD\b|\{COMMANDCODE_CWD\})/;

/**
 * Official `.agents/skills` walk-up: from cwd, at most this many parent hops,
 * stopping before home so `~/.agents/skills` is never a project source.
 */
export const COMMANDCODE_AGENTS_SKILLS_MAX_HOPS = 10;

/** Shadowed Command Code config is inventoried but is not currently loaded. */
export function isShadowedCommandcode(effective: boolean | undefined): boolean {
  return effective === false;
}

/**
 * Spec/runtime skill checks. Shadowed Command Code sources (`.commandcode` and
 * extras) are skipped. Portable `.agents` / Cursor / Codex skills still check.
 */
export function shouldCheckSkillRuntime(skill: {
  commandcodeEffective?: boolean;
  sourceProvider?: Provider;
}): boolean {
  if (skill.commandcodeEffective !== false) {
    return true;
  }
  return (
    skill.sourceProvider === "agent-skills" ||
    skill.sourceProvider === "cursor" ||
    skill.sourceProvider === "codex"
  );
}
