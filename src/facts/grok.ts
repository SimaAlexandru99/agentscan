/** Official Grok Build values. See docs/spec/grok-*.md (read 2026-08-31). */

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
