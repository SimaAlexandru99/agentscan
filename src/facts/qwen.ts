/**
 * Qwen Code hook facts. See docs/spec/qwen-hooks.md.
 *
 * Claude-style names, not Gemini's: Qwen has `PreToolUse`, not `BeforeTool`.
 */

/** The 23 events of the "Hook Events" table (read 2026-11-14). */
export const QWEN_HOOK_EVENTS = new Set([
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "PostToolBatch",
  "UserPromptSubmit",
  "UserPromptExpansion",
  "SessionStart",
  "SessionEnd",
  "SessionDelete",
  "MessageDisplay",
  "Stop",
  "StopFailure",
  "SubagentStart",
  "SubagentStop",
  "PreCompact",
  "PostCompact",
  "Notification",
  "PermissionRequest",
  "PermissionDenied",
  "TodoCreated",
  "TodoCompleted",
  "InstructionsLoaded",
  "FileChanged",
]);

/** Public handler types. `function` is internal to skills and is neither validated nor flagged. */
export const QWEN_HOOK_HANDLER_TYPES = new Set(["command", "http", "prompt", "function"]);
