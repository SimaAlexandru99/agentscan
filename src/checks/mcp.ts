import { isShadowedCommandcode } from "../facts/commandcode";
import { assertNever, type McpSchemaProfile } from "../facts/provider";
import type { Facts, Finding, McpFact } from "../facts/types";
import { make } from "./make";

/**
 * Token shapes worth failing a build over. Deliberately narrow — no entropy
 * guessing.
 *
 * ORDER IS SIGNIFICANT: the caller uses `.find()`, so a more specific prefix
 * must come before any pattern that also matches it. `sk-ant-` is a subset of
 * `sk-`, and reporting the wrong provider on a "rotate this key" finding sends
 * the user to the wrong dashboard.
 */
const SECRET_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "Anthropic key", re: /\bsk-ant-[A-Za-z0-9_-]{16,}/ },
  { label: "OpenAI project key", re: /\bsk-proj-[A-Za-z0-9_-]{16,}/ },
  { label: "OpenAI service-account key", re: /\bsk-svcacct-[A-Za-z0-9_-]{16,}/ },
  { label: "OpenAI-style key", re: /\bsk-[A-Za-z0-9_]{20,}\b/ },
  { label: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{20,}/ },
  { label: "Google API key", re: /\bAIza[A-Za-z0-9_-]{20,}/ },
  { label: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { label: "AWS access key id", re: /\bAKIA[0-9A-Z]{16}\b/ },
];

const INTERPOLATED =
  /\$\{[A-Za-z_][A-Za-z0-9_]*(?::-[^}]*)?\}|\$\{env:[A-Za-z_][A-Za-z0-9_]*\}|\$\{input:[A-Za-z0-9_-]+\}|\$[A-Za-z_][A-Za-z0-9_]*/;

function profileOf(server: McpFact): McpSchemaProfile {
  return server.schemaProfile ?? "claude-json";
}

function isLaunchable(server: McpFact): boolean {
  if (server.launchKind === "registry-reference") {
    return true;
  }
  const profile = profileOf(server);
  switch (profile) {
    case "antigravity-json":
      return server.hasCommand || server.hasServerUrl === true;
    case "claude-json":
    case "mcp-json":
    case "commandcode-json":
    case "vscode-json":
    case "cursor-json":
    case "codex-toml":
    case "opencode-json":
    case "continue-yaml":
      return server.hasCommand || server.hasUrl;
    case "gemini-json":
      return server.hasCommand || server.hasUrl || server.hasHttpUrl === true;
    default: {
      return assertNever(profile, `unhandled MCP schema profile: ${profile}`);
    }
  }
}

function noLaunchId(profile: McpSchemaProfile): string {
  switch (profile) {
    case "claude-json":
    case "mcp-json":
      // Shared `.mcp.json` still needs a launch field for Claude. Command Code
      // transport defects fire first when `transport`/`type` is present.
      return "claude.mcp.no-launch";
    case "commandcode-json":
      return "commandcode.mcp.no-launch";
    case "vscode-json":
      return "vscode.mcp.no-launch";
    case "cursor-json":
      return "cursor.mcp.no-launch";
    case "antigravity-json":
      return "antigravity.mcp.no-launch";
    case "codex-toml":
      return "codex.mcp.no-launch";
    case "gemini-json":
      return "gemini.mcp.no-launch";
    case "opencode-json":
      return "opencode.mcp.no-launch";
    case "continue-yaml":
      return "continue.mcp.no-launch";
    default: {
      return assertNever(profile, `unhandled MCP schema profile: ${profile}`);
    }
  }
}

function noLaunchMessage(server: McpFact): string {
  const profile = profileOf(server);
  switch (profile) {
    case "antigravity-json":
      return `MCP server "${server.name}" declares neither command nor serverUrl`;
    case "gemini-json":
      return `MCP server "${server.name}" declares neither command, url, nor httpUrl`;
    case "continue-yaml":
      return `MCP server "${server.name}" declares neither command, url, nor uses`;
    case "claude-json":
    case "mcp-json":
    case "commandcode-json":
    case "vscode-json":
    case "cursor-json":
    case "codex-toml":
    case "opencode-json":
      return `MCP server "${server.name}" declares neither command nor url`;
    default: {
      return assertNever(profile, `unhandled MCP schema profile: ${profile}`);
    }
  }
}

function noLaunchSuggest(server: McpFact): string {
  const profile = profileOf(server);
  switch (profile) {
    case "antigravity-json":
      return `Add a command (or serverUrl) for "${server.name}", or remove it`;
    case "gemini-json":
      return `Add a command, url, or httpUrl for "${server.name}", or remove it`;
    case "continue-yaml":
      return `Add a command, url, or uses: block for "${server.name}", or remove it`;
    case "claude-json":
    case "mcp-json":
    case "commandcode-json":
    case "vscode-json":
    case "cursor-json":
    case "codex-toml":
    case "opencode-json":
      return `Add a command or url for "${server.name}", or remove it`;
    default: {
      return assertNever(profile, `unhandled MCP schema profile: ${profile}`);
    }
  }
}

function redactInterpolated(raw: string): string {
  return raw.replace(INTERPOLATED, "");
}

function openCodeDefectRule(
  defect: NonNullable<McpFact["opencodeDefect"]>,
): string {
  switch (defect) {
    case "missing-type":
      return "opencode.mcp.missing-type";
    case "local-without-command":
      return "opencode.mcp.local-without-command";
    case "remote-without-url":
      return "opencode.mcp.remote-without-url";
    case "invalid-launch-for-type":
      return "opencode.mcp.invalid-launch-for-type";
    default: {
      return assertNever(defect, `unhandled OpenCode MCP defect: ${defect}`);
    }
  }
}

function openCodeDefectMessage(server: McpFact, defect: NonNullable<McpFact["opencodeDefect"]>): string {
  switch (defect) {
    case "missing-type":
      return `OpenCode MCP server "${server.name}" is missing a valid type ("local" or "remote")`;
    case "local-without-command":
      return `OpenCode MCP server "${server.name}" is type local but declares no command`;
    case "remote-without-url":
      return `OpenCode MCP server "${server.name}" is type remote but declares no url`;
    case "invalid-launch-for-type":
      return `OpenCode MCP server "${server.name}" declares a launch field that does not match type "${server.transport ?? "unknown"}"`;
    default: {
      return assertNever(defect, `unhandled OpenCode MCP defect: ${defect}`);
    }
  }
}

function openCodeDefectSuggest(server: McpFact, defect: NonNullable<McpFact["opencodeDefect"]>): string {
  switch (defect) {
    case "missing-type":
      return `Set "type": "local" with command, or "type": "remote" with url, on "${server.name}"`;
    case "local-without-command":
      return `Add a command array for "${server.name}", or change type to remote`;
    case "remote-without-url":
      return `Add a url for "${server.name}", or change type to local`;
    case "invalid-launch-for-type":
      return `Keep only the launch field that matches type on "${server.name}"`;
    default: {
      return assertNever(defect, `unhandled OpenCode MCP defect: ${defect}`);
    }
  }
}

function commandcodeDefectRule(
  defect: NonNullable<McpFact["commandcodeDefect"]>,
): string {
  switch (defect) {
    case "invalid-transport":
      return "commandcode.mcp.invalid-transport";
    case "http-without-url":
      return "commandcode.mcp.http-without-url";
    case "stdio-without-command":
      return "commandcode.mcp.stdio-without-command";
    default: {
      return assertNever(defect, `unhandled Command Code MCP defect: ${defect}`);
    }
  }
}

function commandcodeDefectMessage(
  server: McpFact,
  defect: NonNullable<McpFact["commandcodeDefect"]>,
): string {
  switch (defect) {
    case "invalid-transport":
      return `MCP server "${server.name}" has invalid transport "${server.transport ?? "unknown"}" (want "http" or "stdio")`;
    case "http-without-url":
      return `MCP server "${server.name}" is HTTP transport but declares no url`;
    case "stdio-without-command":
      return `MCP server "${server.name}" is stdio transport but declares no command`;
    default: {
      return assertNever(defect, `unhandled Command Code MCP defect: ${defect}`);
    }
  }
}

function commandcodeDefectSuggest(
  server: McpFact,
  defect: NonNullable<McpFact["commandcodeDefect"]>,
): string {
  switch (defect) {
    case "invalid-transport":
      return `Set "transport": "http" with url, or "transport": "stdio" with command, on "${server.name}"`;
    case "http-without-url":
      return `Add a url for "${server.name}", or change transport to stdio`;
    case "stdio-without-command":
      return `Add a command for "${server.name}", or change transport to http`;
    default: {
      return assertNever(defect, `unhandled Command Code MCP defect: ${defect}`);
    }
  }
}

function claudeUrlNeedsType(server: McpFact): boolean {
  if (server.inventoryOnly === true || !server.hasUrl) {
    return false;
  }
  const profile = profileOf(server);
  if (profile === "claude-json") {
    if (server.transportField === "transport") {
      return true;
    }
    return server.transport === undefined;
  }
  if (profile === "mcp-json") {
    return server.transport === undefined;
  }
  return false;
}

export function checkMcp(facts: Facts): Finding[] {
  const out: Finding[] = [];
  for (const server of facts.mcp) {
    const shadowed = isShadowedCommandcode(server.commandcodeEffective);
    if (shadowed) {
      // Inventoried but not currently loaded. Schema/runtime errors would
      // claim a shadowed definition is breaking the runtime. Secrets still
      // apply to every readable file.
    } else if (server.inventoryOnly === true) {
      // Unnamed inline mcp.servers item — present in the inventory only.
    } else if (server.opencodeInherit === true) {
      // V1 enabled-only override — launch data may live in an external file.
    } else if (server.opencodeDefect !== undefined) {
      const defect = server.opencodeDefect;
      out.push(
        make(openCodeDefectRule(defect), `mcp:${server.name}@${server.path}`, {
          action: "warn",
          severity: "error",
          message: openCodeDefectMessage(server, defect),
          reason:
            "OpenCode V2 requires type local+command or remote+url. V1 uses the same pair on servers listed directly under mcp. See docs/spec/opencode-mcp.md.",
          evidence: [{ kind: "mcp", value: `${server.name} @ ${server.path}` }],
          suggest: openCodeDefectSuggest(server, defect),
        }),
      );
    } else if (server.commandcodeDefect !== undefined) {
      const defect = server.commandcodeDefect;
      out.push(
        make(commandcodeDefectRule(defect), `mcp:${server.name}@${server.path}`, {
          action: "warn",
          severity: "error",
          message: commandcodeDefectMessage(server, defect),
          reason:
            "Command Code MCP transports are http (url) or stdio (command). `type` is an alias for `transport`. On shared `.mcp.json`, Claude's sse/ws types are left alone. See docs/spec/commandcode-mcp.md.",
          evidence: [{ kind: "mcp", value: `${server.name} @ ${server.path}` }],
          suggest: commandcodeDefectSuggest(server, defect),
        }),
      );
    } else if (!isLaunchable(server)) {
      out.push(
        make(noLaunchId(profileOf(server)), `mcp:${server.name}@${server.path}`, {
          action: "warn",
          severity: "error",
          message: noLaunchMessage(server),
          reason:
            "Without a launch field the entry is not a launchable MCP server by its provider schema — its tools will not be available. See the matching docs/spec/*-mcp.md file.",
          evidence: [{ kind: "mcp", value: `${server.name} @ ${server.path}` }],
          suggest: noLaunchSuggest(server),
        }),
      );
    }

    if (!shadowed && server.command !== undefined && server.commandExists === false) {
      out.push(
        make("mcp.command-missing", `mcp:${server.name}@${server.path}${
          server.platform === undefined ? "" : `:${server.platform}`
        }`, {
          action: "warn",
          severity: "error",
          message: `MCP server "${server.name}" points at a command path that does not exist: ${server.command}`,
          reason:
            "The server declares a filesystem command, but that path is not a file on disk, so the entry is not launchable as configured. Bare PATH binaries are not checked — only path-like values this tool can resolve honestly.",
          evidence: [
            { kind: "mcp", value: `${server.name} @ ${server.path}` },
            { kind: "command", value: server.command },
          ],
          suggest: `Restore ${server.command} or fix the command path for "${server.name}"`,
        }),
      );
    }

    if (!shadowed && claudeUrlNeedsType(server)) {
      out.push(
        make("claude.mcp.url-without-type", `mcp:${server.name}@${server.path}`, {
          action: "warn",
          severity: "error",
          message: `MCP server "${server.name}" has a url but no transport type`,
          reason:
            "An entry with no `type` is read as a stdio server, so a remote server declared this way is misconfigured by schema and is skipped — its tools never appear. On shared `.mcp.json`, a Command Code `transport` field satisfies the other consumer and this check does not fire. See docs/spec/mcp.md and docs/spec/commandcode-mcp.md.",
          evidence: [{ kind: "mcp", value: `${server.name} @ ${server.path}` }],
          suggest: `Add "type": "http" (or "sse" / "ws") to "${server.name}"`,
        }),
      );
    }

    const hit = SECRET_PATTERNS.find((p) => p.re.test(redactInterpolated(server.raw)));
    if (hit !== undefined) {
      out.push(
        make("security.hardcoded-secret", `mcp:${server.name}@${server.path}`, {
          action: "warn",
          severity: "error",
          message: `MCP server "${server.name}" contains what looks like a hardcoded credential (${hit.label})`,
          reason:
            "Credentials in a config file get committed, shared and cached. Treat it as leaked: rotate the key, then reference it through an environment variable.",
          evidence: [{ kind: "mcp", value: `${server.name} @ ${server.path}` }],
          suggest:
            "Rotate the credential, then replace the literal with an interpolated reference",
        }),
      );
      continue;
    }

    if (server.literalEnvKeys.length > 0) {
      out.push(
        make("mcp.literal-env", `mcp:${server.name}@${server.path}`, {
          action: "warn",
          severity: "warning",
          message: `MCP server "${server.name}" has literal env values: ${server.literalEnvKeys.join(", ")}`,
          reason:
            "Secret-named env keys (TOKEN, SECRET, KEY, PASSWORD) with a non-interpolated value are usually credentials that should be referenced through ${VAR}, ${env:VAR}, or ${input:id} so they are never committed.",
          evidence: [
            { kind: "mcp", value: `${server.name} @ ${server.path}` },
            { kind: "env", value: server.literalEnvKeys.join(",") },
          ],
          suggest: "Replace the literals with interpolated environment references",
        }),
      );
    }
  }
  return out;
}
