/**
 * Kiro hook facts. See docs/spec/kiro-hooks.md.
 *
 * PascalCase triggers from the IDE 1.0 table. Do not validate these against
 * Claude's 33-name set: overlap (`PreToolUse`, `Stop`) is coincidental.
 */

/**
 * IDE 1.0 table (read 2026-09-07) plus `SessionEnd`, `PreCompact`, and
 * `PostCompact` quoted on https://kiro.dev/docs/hooks/types/ (read 2026-11-12).
 * The types table still lists Pre/Post Task Execution and does not quote a
 * replacement token, so `PreTaskExec` and `PostTaskExec` stay.
 */
export const KIRO_HOOK_EVENTS = new Set([
  "SessionStart",
  "SessionEnd",
  "Stop",
  "UserPromptSubmit",
  "PreCompact",
  "PostCompact",
  "PreTaskExec",
  "PostTaskExec",
  "PreToolUse",
  "PostToolUse",
  "PostFileCreate",
  "PostFileSave",
  "PostFileDelete",
]);

/** Quoted: action.type is `command` or `agent`. */
export const KIRO_HOOK_HANDLER_TYPES = new Set(["command", "agent"]);
