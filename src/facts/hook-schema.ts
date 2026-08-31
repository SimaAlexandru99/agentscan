import type { Provider } from "./provider";

/**
 * File-schema contract for a hooks object. Distinct from `sourceProvider`:
 * `.github/hooks` is always VS Code-owned, but `version: 1` is Copilot CLI.
 *
 * See docs/spec/hook-events.md, docs/spec/vscode-hooks.md, docs/spec/copilot-hooks.md.
 */
export type HookSchemaProfile = "claude" | "vscode-native" | "copilot-cli" | "commandcode" | "grok";

export type HookHandlerType = "command" | "http" | "mcp_tool" | "prompt" | "agent";

/** Source: docs/spec/hook-events.md (read 2026-08-31) */
export const KNOWN_HOOK_EVENTS = new Set([
  "SessionStart",
  "Setup",
  "UserPromptSubmit",
  "UserPromptExpansion",
  "PreToolUse",
  "PermissionRequest",
  "PermissionDenied",
  "PostToolUse",
  "PostToolUseFailure",
  "PostToolBatch",
  "Notification",
  "MessageDisplay",
  "SubagentStart",
  "SubagentStop",
  "TaskCreated",
  "TaskCompleted",
  "Stop",
  "StopFailure",
  "TeammateIdle",
  "InstructionsLoaded",
  "ConfigChange",
  "CwdChanged",
  "DirectoryAdded",
  "FileChanged",
  "WorktreeCreate",
  "WorktreeRemove",
  "PreCompact",
  "PostCompact",
  "Elicitation",
  "ElicitationResult",
  "SessionEnd",
  "PreModelSwitch",
  "PostModelSwitch",
]);

/** Source: docs/spec/vscode-hooks.md (read 2026-08-31) */
export const VSCODE_HOOK_EVENTS = new Set([
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PreCompact",
  "SubagentStart",
  "SubagentStop",
  "Stop",
]);

/**
 * Copilot CLI camelCase names that map onto the VS Code event set.
 * Source: docs/spec/copilot-hooks.md (read 2026-08-31)
 */
export const COPILOT_TO_VSCODE_EVENT: Readonly<Record<string, string>> = {
  sessionStart: "SessionStart",
  userPromptSubmitted: "UserPromptSubmit",
  preToolUse: "PreToolUse",
  postToolUse: "PostToolUse",
  preCompact: "PreCompact",
  subagentStart: "SubagentStart",
  subagentStop: "SubagentStop",
  agentStop: "Stop",
};

/** Copilot-only events. Not valid on native VS Code files. */
export const COPILOT_ONLY_EVENTS = new Set([
  "sessionEnd",
  "errorOccurred",
  "notification",
  "permissionRequest",
  "postToolUseFailure",
  "userPromptTransformed",
]);

export const COPILOT_HOOK_EVENTS = new Set([
  ...VSCODE_HOOK_EVENTS,
  ...Object.keys(COPILOT_TO_VSCODE_EVENT),
  ...COPILOT_ONLY_EVENTS,
]);

/**
 * Claude events that accept every handler type (command, http, mcp_tool, prompt, agent).
 * Source: docs/spec/hook-events.md (read 2026-08-31)
 */
export const CLAUDE_ALL_HANDLER_EVENTS = new Set([
  "PermissionDenied",
  "PermissionRequest",
  "PostToolBatch",
  "PostToolUse",
  "PostToolUseFailure",
  "PreToolUse",
  "Stop",
  "SubagentStop",
  "TaskCompleted",
  "TaskCreated",
  "TeammateIdle",
  "UserPromptExpansion",
  "UserPromptSubmit",
]);

/** Claude events that accept command, http, and mcp_tool only. */
export const CLAUDE_COMMAND_HTTP_MCP_EVENTS = new Set([
  "ConfigChange",
  "CwdChanged",
  "DirectoryAdded",
  "Elicitation",
  "ElicitationResult",
  "FileChanged",
  "InstructionsLoaded",
  "MessageDisplay",
  "Notification",
  "PostCompact",
  "PostModelSwitch",
  "PreCompact",
  "PreModelSwitch",
  "SessionEnd",
  "StopFailure",
  "SubagentStart",
  "WorktreeCreate",
  "WorktreeRemove",
]);

/** Claude events that accept command and mcp_tool only (no http, prompt, or agent). */
export const CLAUDE_COMMAND_MCP_EVENTS = new Set(["SessionStart", "Setup"]);

export function inferHookSchemaProfile(
  sourceProvider: Provider,
  explicit?: HookSchemaProfile,
): HookSchemaProfile {
  if (explicit !== undefined) {
    return explicit;
  }
  switch (sourceProvider) {
    case "commandcode":
      return "commandcode";
    case "grok":
      return "grok";
    case "vscode":
      return "vscode-native";
    case "claude":
    case "agent-skills":
    case "codex":
    case "cursor":
    case "antigravity":
    case "gemini":
    case "windsurf":
    case "kiro":
    case "cline":
    case "roo":
    case "kilo":
    case "opencode":
    case "junie":
    case "continue":
    case "unknown":
      return "claude";
    default: {
      const neverProvider: never = sourceProvider;
      return neverProvider;
    }
  }
}

export function claudeHandlerCompatible(event: string, type: HookHandlerType): boolean {
  if (!KNOWN_HOOK_EVENTS.has(event)) {
    return true;
  }
  if (CLAUDE_ALL_HANDLER_EVENTS.has(event)) {
    return true;
  }
  if (CLAUDE_COMMAND_MCP_EVENTS.has(event)) {
    return type === "command" || type === "mcp_tool";
  }
  if (CLAUDE_COMMAND_HTTP_MCP_EVENTS.has(event)) {
    return type === "command" || type === "http" || type === "mcp_tool";
  }
  return true;
}

export function copilotCanonicalEvent(event: string): string {
  return COPILOT_TO_VSCODE_EVENT[event] ?? event;
}

export function isKnownCopilotEvent(event: string): boolean {
  return COPILOT_HOOK_EVENTS.has(event);
}

export function isCopilotCliHooksDocument(raw: Record<string, unknown>): boolean {
  return raw.version === 1;
}
