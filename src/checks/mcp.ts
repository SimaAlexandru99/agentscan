import type { Facts, Finding } from "../facts/types";
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
  // No embedded hyphens after the prefix. `sk-mcp-server-toolkit` is a package
  // name, and calling it a leaked credential at severity error is unfalsifiable
  // from the report, since the matched value is correctly never echoed.
  { label: "OpenAI-style key", re: /\bsk-[A-Za-z0-9_]{20,}\b/ },
  { label: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{20,}/ },
  { label: "Google API key", re: /\bAIza[A-Za-z0-9_-]{20,}/ },
  { label: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { label: "AWS access key id", re: /\bAKIA[0-9A-Z]{16}\b/ },
];

export function checkMcp(facts: Facts): Finding[] {
  const out: Finding[] = [];
  for (const server of facts.mcp) {
    if (!(server.hasCommand || server.hasUrl)) {
      out.push(
        make("mcp.no-launch", `mcp:${server.name}@${server.path}`, {
          action: "warn",
          severity: "error",
          message: `MCP server "${server.name}" declares neither command nor url`,
          reason:
            "Without a command or url the entry is not a launchable MCP server by schema — its tools will not be available, and the entry is dead weight that still costs a config read.",
          evidence: [{ kind: "mcp", value: `${server.name} @ ${server.path}` }],
          suggest: `Add a command (or url) for "${server.name}", or remove it`,
        }),
      );
    }

    // Path-like command that is missing on disk — same shape as hook.missing-script.
    // Bare PATH binaries are never resolved here; a false "broken" on `npx` would
    // be worse than silence. See docs/spec/mcp.md.
    if (
      server.command !== undefined &&
      server.commandExists === false
    ) {
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

    // Documented behaviour: an entry with a url and no `type` is read as a
    // stdio server, fails schema validation, and is skipped — so its tools are
    // silently absent.
    if (server.hasUrl && server.transport === undefined) {
      out.push(
        make("mcp.url-without-type", `mcp:${server.name}@${server.path}`, {
          action: "warn",
          severity: "error",
          message: `MCP server "${server.name}" has a url but no transport type`,
          reason:
            "An entry with no `type` is read as a stdio server, so a remote server declared this way is misconfigured by schema and is skipped — its tools never appear, with no error in the report you are reading. See docs/spec/mcp.md.",
          evidence: [{ kind: "mcp", value: `${server.name} @ ${server.path}` }],
          suggest: `Add "type": "http" (or "sse" / "ws") to "${server.name}"`,
        }),
      );
    }

    const hit = SECRET_PATTERNS.find((p) => p.re.test(server.raw));
    if (hit !== undefined) {
      out.push(
        make("mcp.hardcoded-secret", `mcp:${server.name}@${server.path}`, {
          action: "warn",
          severity: "error",
          // The matched value is deliberately never echoed.
          message: `MCP server "${server.name}" contains what looks like a hardcoded credential (${hit.label})`,
          reason:
            "Credentials in a config file get committed, shared and cached. Treat it as leaked: rotate the key, then reference it through an environment variable.",
          evidence: [{ kind: "mcp", value: `${server.name} @ ${server.path}` }],
          suggest:
            "Rotate the credential, then replace the literal with ${ENV_VAR}",
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
            "Long literal env values in config are usually secrets that should be indirected through ${VAR} so they are never committed.",
          evidence: [
            { kind: "mcp", value: `${server.name} @ ${server.path}` },
            { kind: "env", value: server.literalEnvKeys.join(",") },
          ],
          suggest: "Replace the literals with ${ENV_VAR} references",
        }),
      );
    }
  }
  return out;
}
