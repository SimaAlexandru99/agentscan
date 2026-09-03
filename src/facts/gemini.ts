/**
 * Gemini CLI hook facts. See docs/spec/gemini-hooks.md.
 *
 * Gemini's names are its own: `BeforeTool` is not Claude's `PreToolUse` and
 * `PreCompress` is not `PreCompact`. Validating one set against the other is
 * how a working hook gets reported dead.
 */

/** Quoted event table on the hooks page (read 2026-09-03). */
export const GEMINI_HOOK_EVENTS = new Set([
  "SessionStart",
  "SessionEnd",
  "BeforeAgent",
  "AfterAgent",
  "BeforeModel",
  "AfterModel",
  "BeforeToolSelection",
  "BeforeTool",
  "AfterTool",
  "PreCompress",
  "Notification",
]);

/** Quoted: `type` is required and "Currently only `"command"` is supported." */
export const GEMINI_HOOK_HANDLER_TYPES = new Set(["command"]);

/** Quoted: `GEMINI_PROJECT_DIR` is "the absolute path to the project root". */
export const GEMINI_PROJECT_DIR = /^\$(?:GEMINI_PROJECT_DIR\b|\{GEMINI_PROJECT_DIR\})/;
