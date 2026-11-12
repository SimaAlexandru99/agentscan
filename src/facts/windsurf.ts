/** Windsurf (Cascade) hook facts. See docs/spec/windsurf-hooks.md. */

/** Quoted event table on https://docs.devin.ai/desktop/cascade/hooks (read 2026-08-31). */
export const WINDSURF_HOOK_EVENTS = new Set([
  "pre_read_code",
  "post_read_code",
  "pre_write_code",
  "post_write_code",
  "pre_run_command",
  "post_run_command",
  "pre_mcp_tool_use",
  "post_mcp_tool_use",
  "pre_user_prompt",
  "post_cascade_response",
  "post_cascade_response_with_transcript",
  "post_setup_worktree",
]);
