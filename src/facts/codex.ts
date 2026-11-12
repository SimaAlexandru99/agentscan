/**
 * Codex hook facts. See docs/spec/codex-hooks.md.
 *
 * Nested Claude-shaped groups under a `hooks` key, in `hooks.json` or inline
 * in `config.toml`. Do not validate these names against Claude's set:
 * `PreModelRequest`, `PostModelRequest`, and `Interrupt` are Codex events.
 */

/** Quoted summary table on https://learn.chatgpt.com/docs/hooks (read 2026-11-12). */
export const CODEX_HOOK_EVENTS = new Set([
  "SessionStart",
  "SessionEnd",
  "SubagentStart",
  "PreToolUse",
  "PermissionRequest",
  "PostToolUse",
  "PreCompact",
  "PostCompact",
  "UserPromptSubmit",
  "SubagentStop",
  "Stop",
  "PreModelRequest",
  "PostModelRequest",
  "Interrupt",
]);

/**
 * Configured timeouts on these two events are a closed 1–3 second range.
 * Other events default to 600 and the page quotes no maximum, so they are
 * recorded and not checked.
 */
export const CODEX_SHORT_TIMEOUT_EVENTS = new Set(["SessionEnd", "Interrupt"]);

export const CODEX_SHORT_TIMEOUT_MIN = 1;
export const CODEX_SHORT_TIMEOUT_MAX = 3;
