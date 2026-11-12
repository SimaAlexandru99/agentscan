/**
 * Devin CLI hook facts. See docs/spec/devin-hooks.md.
 *
 * Nested Claude-shaped groups. Do not validate these names against Claude's
 * 33-event set or Windsurf's snake_case set: `PostCompaction` is not
 * `PostCompact`, and the snake_case Cascade file is a different profile.
 */

/** Quoted event table on https://docs.devin.ai/cli/extensibility/hooks/overview (read 2026-11-12). */
export const DEVIN_HOOK_EVENTS = new Set([
  "PreToolUse",
  "PostToolUse",
  "PermissionRequest",
  "UserPromptSubmit",
  "Stop",
  "PostCompaction",
  "SessionStart",
  "SessionEnd",
]);

/** Quoted: type is `command` or `prompt`. */
export const DEVIN_HOOK_HANDLER_TYPES = new Set(["command", "prompt"]);
