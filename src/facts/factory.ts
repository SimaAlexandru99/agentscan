/** Factory Droid facts. See docs/spec/factory-hooks.md and docs/spec/factory-agents.md. */

/** The hooks page `Event` column (read 2026-11-14). */
export const FACTORY_HOOK_EVENTS = new Set([
  "PreToolUse",
  "PostToolUse",
  "UserPromptSubmit",
  "Notification",
  "Stop",
  "SubagentStop",
  "PreCompact",
  "SessionStart",
  "SessionEnd",
]);

/** Quoted droid `name` rule: "Lowercase letters, digits, `-`, `_` (`^[a-z0-9-_]+$`)". */
export const FACTORY_DROID_NAME = /^[a-z0-9-_]+$/;
