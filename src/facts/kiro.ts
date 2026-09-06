/**
 * Kiro hook facts. See docs/spec/kiro-hooks.md.
 *
 * PascalCase triggers from the IDE 1.0 table. Do not validate these against
 * Claude's 33-name set: overlap (`PreToolUse`, `Stop`) is coincidental.
 */

/** Quoted trigger table on https://kiro.dev/docs/ide/whats-new-v1/hooks/ (read 2026-09-07). */
export const KIRO_HOOK_EVENTS = new Set([
  "SessionStart",
  "Stop",
  "UserPromptSubmit",
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
