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
  const profile = profileOf(server);
  switch (profile) {
    case "antigravity-json":
      return server.hasCommand || server.hasServerUrl === true;
    case "claude-json":
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
      return "claude.mcp.no-launch";
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
  switch (profileOf(server)) {
    case "antigravity-json":
      return `MCP server "${server.name}" declares neither command nor serverUrl`;
    case "gemini-json":
      return `MCP server "${server.name}" declares neither command, url, nor httpUrl`;
    case "claude-json":
    case "vscode-json":
    case "cursor-json":
    case "codex-toml":
    case "opencode-json":
    case "continue-yaml":
      return `MCP server "${server.name}" declares neither command nor url`;
    default: {
      return assertNever(profileOf(server), `unhandled MCP schema profile: ${profileOf(server)}`);
    }
  }
}

function noLaunchSuggest(server: McpFact): string {
  switch (profileOf(server)) {
    case "antigravity-json":
      return `Add a command (or serverUrl) for "${server.name}", or remove it`;
    case "gemini-json":
      return `Add a command, url, or httpUrl for "${server.name}", or remove it`;
    case "claude-json":
    case "vscode-json":
    case "cursor-json":
    case "codex-toml":
    case "opencode-json":
    case "continue-yaml":
      return `Add a command (or url) for "${server.name}", or remove it`;
    default: {
      return assertNever(profileOf(server), `unhandled MCP schema profile: ${profileOf(server)}`);
    }
  }
}

function redactInterpolated(raw: string): string {
  return raw.replace(INTERPOLATED, "");
}

export function checkMcp(facts: Facts): Finding[] {
  const out: Finding[] = [];
  for (const server of facts.mcp) {
    if (!isLaunchable(server)) {
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

    if (server.command !== undefined && server.commandExists === false) {
      out.push(
        make("mcp.command-missing", `mcp:${server.name}@${server.path}`, {
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

    if (
      profileOf(server) === "claude-json" &&
      server.hasUrl &&
      server.transport === undefined
    ) {
      out.push(
        make("claude.mcp.url-without-type", `mcp:${server.name}@${server.path}`, {
          action: "warn",
          severity: "error",
          message: `MCP server "${server.name}" has a url but no transport type`,
          reason:
            "An entry with no `type` is read as a stdio server, so a remote server declared this way is misconfigured by schema and is skipped — its tools never appear. See docs/spec/mcp.md.",
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
