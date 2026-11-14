import type { McpSchemaProfile, Provider } from "./provider";
import type { CommandcodeMcpDefect, McpFact } from "./types";

/**
 * Everything one MCP schema profile needs: who owns and loads the file, what
 * counts as a launch field, and how a missing one is reported.
 */
export type McpProfileSpec = {
  sourceProvider: Provider;
  consumedBy: readonly Provider[];
  launchable: (server: McpFact) => boolean;
  /** `no-launch` id is `${ruleIdPrefix}.mcp.no-launch`. */
  ruleIdPrefix: string;
  /** Finishes `MCP server "x" declares …`. */
  noLaunchDeclares: string;
  /** Finishes `Add … for "x", or remove it`. */
  noLaunchAdd: string;
};

const commandOrUrl = (server: McpFact): boolean => server.hasCommand || server.hasUrl;

const COMMAND_OR_URL = {
  launchable: commandOrUrl,
  noLaunchDeclares: "neither command nor url",
  noLaunchAdd: "a command or url",
};

const PROFILES = {
  "claude-json": { ...COMMAND_OR_URL, sourceProvider: "claude", consumedBy: ["claude"], ruleIdPrefix: "claude" },
  // Shared `.mcp.json` still needs a launch field for Claude. Command Code
  // transport defects fire first when `transport`/`type` is present.
  "mcp-json": {
    ...COMMAND_OR_URL,
    sourceProvider: "unknown",
    consumedBy: ["claude", "commandcode"],
    ruleIdPrefix: "claude",
  },
  "commandcode-json": {
    ...COMMAND_OR_URL,
    sourceProvider: "commandcode",
    consumedBy: ["commandcode"],
    ruleIdPrefix: "commandcode",
  },
  "vscode-json": { ...COMMAND_OR_URL, sourceProvider: "vscode", consumedBy: ["vscode"], ruleIdPrefix: "vscode" },
  "cursor-json": { ...COMMAND_OR_URL, sourceProvider: "cursor", consumedBy: ["cursor"], ruleIdPrefix: "cursor" },
  "antigravity-json": {
    sourceProvider: "antigravity",
    consumedBy: ["antigravity"],
    ruleIdPrefix: "antigravity",
    launchable: (server) =>
      server.hasCommand || server.hasServerUrl === true || server.hasUrl,
    noLaunchDeclares: "neither command, serverUrl, nor url",
    noLaunchAdd: "a command, serverUrl, or url",
  },
  "codex-toml": { ...COMMAND_OR_URL, sourceProvider: "codex", consumedBy: ["codex"], ruleIdPrefix: "codex" },
  "gemini-json": {
    sourceProvider: "gemini",
    consumedBy: ["gemini"],
    ruleIdPrefix: "gemini",
    launchable: (server) => commandOrUrl(server) || server.hasHttpUrl === true,
    noLaunchDeclares: "neither command, url, nor httpUrl",
    noLaunchAdd: "a command, url, or httpUrl",
  },
  "opencode-json": {
    ...COMMAND_OR_URL,
    sourceProvider: "opencode",
    consumedBy: ["opencode"],
    ruleIdPrefix: "opencode",
  },
  "continue-yaml": {
    sourceProvider: "continue",
    consumedBy: ["continue"],
    ruleIdPrefix: "continue",
    launchable: commandOrUrl,
    noLaunchDeclares: "neither command, url, nor uses",
    noLaunchAdd: "a command, url, or uses: block",
  },
  "grok-toml": { ...COMMAND_OR_URL, sourceProvider: "grok", consumedBy: ["grok"], ruleIdPrefix: "grok" },
  "windsurf-json": {
    sourceProvider: "windsurf",
    consumedBy: ["windsurf"],
    ruleIdPrefix: "windsurf",
    launchable: (server) => commandOrUrl(server) || server.hasServerUrl === true,
    noLaunchDeclares: "neither command, serverUrl, nor url",
    noLaunchAdd: "a command, serverUrl, or url",
  },
  "devin-json": {
    ...COMMAND_OR_URL,
    sourceProvider: "devin",
    consumedBy: ["devin"],
    ruleIdPrefix: "devin",
  },
  // Copilot's portable file. Same launch fields as `.vscode/mcp.json`, so it
  // shares `vscode.mcp.no-launch` and does not pull Claude's url-without-type.
  "copilot-json": {
    ...COMMAND_OR_URL,
    sourceProvider: "vscode",
    consumedBy: ["vscode"],
    ruleIdPrefix: "vscode",
  },
  "zed-json": { ...COMMAND_OR_URL, sourceProvider: "zed", consumedBy: ["zed"], ruleIdPrefix: "zed" },
  "amp-json": { ...COMMAND_OR_URL, sourceProvider: "amp", consumedBy: ["amp"], ruleIdPrefix: "amp" },
} as const satisfies Record<McpSchemaProfile, McpProfileSpec>;

export const MCP_PROFILES: Record<McpSchemaProfile, McpProfileSpec> = PROFILES;

/** Every `no-launch` id the table can build; `make()` rejects an unregistered one at compile time. */
export type McpNoLaunchRuleId = `${(typeof PROFILES)[McpSchemaProfile]["ruleIdPrefix"]}.mcp.no-launch`;

export function mcpNoLaunchRuleId(profile: McpSchemaProfile): McpNoLaunchRuleId {
  return `${PROFILES[profile].ruleIdPrefix}.mcp.no-launch`;
}

type DefectText = { message: (server: McpFact) => string; suggest: (server: McpFact) => string };

/** Rule id is `opencode.mcp.${defect}`. */
export const OPENCODE_MCP_DEFECTS: Record<NonNullable<McpFact["opencodeDefect"]>, DefectText> = {
  "missing-type": {
    message: (s) => `OpenCode MCP server "${s.name}" is missing a valid type ("local" or "remote")`,
    suggest: (s) => `Set "type": "local" with command, or "type": "remote" with url, on "${s.name}"`,
  },
  "local-without-command": {
    message: (s) => `OpenCode MCP server "${s.name}" is type local but declares no command`,
    suggest: (s) => `Add a command array for "${s.name}", or change type to remote`,
  },
  "remote-without-url": {
    message: (s) => `OpenCode MCP server "${s.name}" is type remote but declares no url`,
    suggest: (s) => `Add a url for "${s.name}", or change type to local`,
  },
  "invalid-launch-for-type": {
    message: (s) =>
      `OpenCode MCP server "${s.name}" declares a launch field that does not match type "${s.transport ?? "unknown"}"`,
    suggest: (s) => `Keep only the launch field that matches type on "${s.name}"`,
  },
  "command-not-array": {
    message: (s) => `OpenCode MCP server "${s.name}" is type local but command is not an argv array`,
    suggest: (s) => `Set "command" to an argv array on "${s.name}"`,
  },
};

/** Rule id is `commandcode.mcp.${defect}`. */
export const COMMANDCODE_MCP_DEFECTS: Record<CommandcodeMcpDefect, DefectText> = {
  "invalid-transport": {
    message: (s) =>
      `MCP server "${s.name}" has invalid transport "${s.transport ?? "unknown"}" (want "http" or "stdio")`,
    suggest: (s) => `Set "transport": "http" with url, or "transport": "stdio" with command, on "${s.name}"`,
  },
  "http-without-url": {
    message: (s) => `MCP server "${s.name}" is HTTP transport but declares no url`,
    suggest: (s) => `Add a url for "${s.name}", or change transport to stdio`,
  },
  "stdio-without-command": {
    message: (s) => `MCP server "${s.name}" is stdio transport but declares no command`,
    suggest: (s) => `Add a command for "${s.name}", or change transport to http`,
  },
};
