/**
 * Cursor hook facts. See docs/spec/cursor-hooks.md.
 *
 * camelCase and Cursor's own vocabulary: `preToolUse` is not Claude's
 * `PreToolUse`, and the page documents no PascalCase spelling, so the Copilot
 * CLI aliasing must not be applied here.
 */

/** Quoted agent hooks — "apply to Cmd+K and Agent Chat operations". */
const CURSOR_AGENT_HOOK_EVENTS = [
  "sessionStart",
  "sessionEnd",
  "preToolUse",
  "postToolUse",
  "postToolUseFailure",
  "subagentStart",
  "subagentStop",
  "beforeShellExecution",
  "afterShellExecution",
  "beforeMCPExecution",
  "afterMCPExecution",
  "beforeReadFile",
  "afterFileEdit",
  "beforeSubmitPrompt",
  "preCompact",
  "stop",
  "afterAgentResponse",
  "afterAgentThought",
];

/** Quoted tab hooks — "apply specifically to inline Tab completions". */
const CURSOR_TAB_HOOK_EVENTS = ["beforeTabFileRead", "afterTabFileEdit"];

/** Quoted app lifecycle hook — fires "independent of any agent session". */
const CURSOR_APP_HOOK_EVENTS = ["workspaceOpen"];

export const CURSOR_HOOK_EVENTS = new Set([
  ...CURSOR_AGENT_HOOK_EVENTS,
  ...CURSOR_TAB_HOOK_EVENTS,
  ...CURSOR_APP_HOOK_EVENTS,
]);

/**
 * Quoted `type` option: `"command" | "prompt"`, default `"command"`.
 * Optional here, unlike Claude and Gemini — an absent `type` is a command hook,
 * never `unknown-handler-type`.
 */
export const CURSOR_HOOK_HANDLER_TYPES = new Set(["command", "prompt"]);
