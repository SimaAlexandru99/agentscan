/** Official Command Code values. See docs/spec/commandcode-*.md (read 2026-08-31). */

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

export const COMMANDCODE_PERMISSION_MODES = new Set([
  "default",
  "auto-accept",
  "bypass",
  "plan",
  "dont-ask",
]);

export const COMMANDCODE_MCP_TRANSPORTS = new Set(["http", "stdio"]);

/** Claude transports that are valid on the shared `.mcp.json` path. */
export const CLAUDE_MCP_TRANSPORTS = new Set(["stdio", "http", "sse", "ws"]);

export const COMMANDCODE_HOOK_TIMEOUT_MIN = 0;
export const COMMANDCODE_HOOK_TIMEOUT_MAX = 600;

export const COMMANDCODE_PROJECT_DIR =
  /^\$(?:COMMANDCODE_PROJECT_DIR\b|\{COMMANDCODE_PROJECT_DIR\}|COMMANDCODE_CWD\b|\{COMMANDCODE_CWD\})/;
