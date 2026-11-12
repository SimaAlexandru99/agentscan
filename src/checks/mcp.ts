import { isShadowed } from "../facts/precedence";
import {
  COMMANDCODE_MCP_DEFECTS,
  MCP_PROFILES,
  mcpNoLaunchRuleId,
  OPENCODE_MCP_DEFECTS,
} from "../facts/mcp-profiles";
import type { Facts, McpFact } from "../facts/types";
import type { Evidence, Finding } from "../findings";
import { make } from "./make";

function isLaunchable(server: McpFact): boolean {
  return server.launchKind === "registry-reference" || MCP_PROFILES[server.schemaProfile].launchable(server);
}

const CLAUDE_RESERVED_MCP_NAMES = new Set([
  "workspace",
  "claude-in-chrome",
  "computer-use",
  "Claude Preview",
  "Claude Browser",
]);

function claudeConsumes(server: McpFact): boolean {
  return MCP_PROFILES[server.schemaProfile].consumedBy.includes("claude");
}

function claudeUrlNeedsType(server: McpFact): boolean {
  if (server.inventoryOnly === true || !server.hasUrl || !claudeConsumes(server)) {
    return false;
  }
  // `transport` is Command Code's field: it satisfies a consumer only on shared `.mcp.json`.
  if (server.schemaProfile === "claude-json" && server.transportField === "transport") {
    return true;
  }
  return server.transport === undefined;
}

function mcpEvidence(server: McpFact): Evidence {
  return { kind: "mcp", value: `${server.name} @ ${server.path}` };
}

function mcpSubject(server: McpFact): string {
  const layer = server.claudeMcpLayer === undefined ? "" : `:${server.claudeMcpLayer}`;
  const platform = server.platform === undefined ? "" : `:${server.platform}`;
  return `mcp:${server.name}@${server.path}${layer}${platform}`;
}

function mcpRuntimeFindings(server: McpFact, subject: string): Finding[] {
  const out: Finding[] = [];
  if (server.inventoryOnly === true) {
    // Unnamed inline mcp.servers item — present in the inventory only.
  } else if (server.opencodeInherit === true) {
    // V1 enabled-only override — launch data may live in an external file.
  } else if (server.opencodeDefect !== undefined) {
    const defect = server.opencodeDefect;
    out.push(
      make(`opencode.mcp.${defect}`, subject, {
        message: OPENCODE_MCP_DEFECTS[defect].message(server),
        reason:
          "OpenCode V2 requires type local+command array or remote+url. V1 uses the same pair on servers listed directly under mcp. See docs/spec/opencode-mcp.md.",
        evidence: [mcpEvidence(server)],
        suggest: OPENCODE_MCP_DEFECTS[defect].suggest(server),
      }),
    );
  } else if (server.commandcodeDefect !== undefined) {
    const defect = server.commandcodeDefect;
    out.push(
      make(`commandcode.mcp.${defect}`, subject, {
        message: COMMANDCODE_MCP_DEFECTS[defect].message(server),
        reason:
          "Command Code MCP transports are http (url) or stdio (command). `type` is an alias for `transport`. On shared `.mcp.json`, Claude's sse/ws types are left alone. See docs/spec/commandcode-mcp.md.",
        evidence: [mcpEvidence(server)],
        suggest: COMMANDCODE_MCP_DEFECTS[defect].suggest(server),
      }),
    );
  } else if (!isLaunchable(server)) {
    out.push(
      make(mcpNoLaunchRuleId(server.schemaProfile), subject, {
        message: `MCP server "${server.name}" declares ${MCP_PROFILES[server.schemaProfile].noLaunchDeclares}`,
        reason:
          "Without a launch field the entry is not a launchable MCP server by its provider schema — its tools will not be available. See the matching docs/spec/*-mcp.md file.",
        evidence: [mcpEvidence(server)],
        suggest: `Add ${MCP_PROFILES[server.schemaProfile].noLaunchAdd} for "${server.name}", or remove it`,
      }),
    );
  }

  if (server.command !== undefined && server.commandExists === false) {
    out.push(
      make("mcp.command-missing", subject, {
        message: `MCP server "${server.name}" points at a command path that does not exist: ${server.command}`,
        reason:
          "The server declares a filesystem command, but that path is not a file on disk, so the entry is not launchable as configured. Bare PATH binaries are not checked — only path-like values this tool can resolve honestly.",
        evidence: [
          mcpEvidence(server),
          { kind: "command", value: server.command },
        ],
        suggest: `Restore ${server.command} or fix the command path for "${server.name}"`,
      }),
    );
  }

  if (claudeUrlNeedsType(server)) {
    out.push(
      make("claude.mcp.url-without-type", subject, {
        message: `MCP server "${server.name}" has a url but no transport type`,
        reason:
          "An entry with no `type` is read as a stdio server, so a remote server declared this way is misconfigured by schema and is skipped — its tools never appear. On shared `.mcp.json`, a Command Code `transport` field satisfies the other consumer and this check does not fire. See docs/spec/mcp.md and docs/spec/commandcode-mcp.md.",
        evidence: [mcpEvidence(server)],
        suggest: `Add "type": "http" (or "sse" / "ws") to "${server.name}"`,
      }),
    );
  }

  if (
    server.continueMissingMetadataKeys !== undefined &&
    server.continueMissingMetadataKeys.length > 0
  ) {
    out.push(
      make("continue.mcp.missing-block-metadata", subject, {
        message: `Continue YAML MCP block is missing ${server.continueMissingMetadataKeys.join(", ")}`,
        reason:
          "Standalone YAML files under `.continue/mcpServers/` require block metadata `name`, `version`, and `schema`. Copied JSON MCP configs in that directory are not subject to these fields. See docs/spec/continue-mcp.md.",
        evidence: [
          mcpEvidence(server),
          { kind: "missing", value: server.continueMissingMetadataKeys.join(",") },
        ],
        suggest: `Add name, version, and schema to ${server.path}`,
      }),
    );
  }

  if (claudeConsumes(server) && CLAUDE_RESERVED_MCP_NAMES.has(server.name)) {
    out.push(
      make("claude.mcp.reserved-name", subject, {
        message: `MCP server "${server.name}" uses a reserved name that Claude skips`,
        reason:
          "Claude Code skips MCP servers named with reserved identifiers, including `workspace`. The server never loads. See docs/spec/mcp.md.",
        evidence: [mcpEvidence(server)],
        suggest: `Rename "${server.name}" — reserved names include workspace, claude-in-chrome, computer-use, Claude Preview, and Claude Browser`,
      }),
    );
  }

  if (server.schemaProfile === "gemini-json" && server.name.includes("_")) {
    out.push(
      make("gemini.mcp.underscore-alias", subject, {
        message: `Gemini MCP server alias "${server.name}" contains an underscore`,
        reason:
          "Official Gemini CLI docs warn that underscores in MCP server names can make policies fail silently, because fully-qualified tool names split on the first underscore after `mcp_`. See docs/spec/gemini-mcp.md.",
        evidence: [mcpEvidence(server)],
        suggest: `Rename "${server.name}" to use hyphens instead of underscores`,
      }),
    );
  }
  return out;
}

export function checkMcp(facts: Facts): Finding[] {
  const out: Finding[] = [];
  for (const server of facts.mcp) {
    const subject = mcpSubject(server);
    if (!isShadowed(server)) {
      // Shadowed config is inventoried but not loaded: schema/runtime errors
      // would blame it for the runtime. Secrets still apply to every file.
      out.push(...mcpRuntimeFindings(server, subject));
    }

    if (server.secretLabel !== undefined) {
      out.push(
        make("security.hardcoded-secret", subject, {
          message: `MCP server "${server.name}" contains what looks like a hardcoded credential (${server.secretLabel})`,
          reason:
            "Credentials in a config file get committed, shared and cached. Treat it as leaked: rotate the key, then reference it through an environment variable.",
          evidence: [mcpEvidence(server)],
          suggest:
            "Rotate the credential, then replace the literal with an interpolated reference",
        }),
      );
      // One server-level error is enough; literal-env/credential would re-flag the same leak as warnings.
      continue;
    }

    if (server.literalEnvKeys.length > 0) {
      out.push(
        make("mcp.literal-env", subject, {
          message: `MCP server "${server.name}" has literal env values: ${server.literalEnvKeys.join(", ")}`,
          reason:
            "Secret-named env keys (TOKEN, SECRET, KEY, PASSWORD) with a non-interpolated value are usually credentials that should be referenced through ${VAR}, ${env:VAR}, or ${input:id} so they are never committed.",
          evidence: [
            mcpEvidence(server),
            { kind: "env", value: server.literalEnvKeys.join(",") },
          ],
          suggest: "Replace the literals with interpolated environment references",
        }),
      );
    }

    const credentialFields = server.literalCredentialFields ?? [];
    if (credentialFields.length > 0) {
      out.push(
        make("mcp.literal-credential", subject, {
          message: `MCP server "${server.name}" has literal credential fields: ${credentialFields.join(", ")}`,
          reason:
            "Secret-named headers, http_headers, or auth values (TOKEN, SECRET, KEY, PASSWORD, Authorization) that are not interpolated are usually credentials that should be referenced through ${VAR}, ${env:VAR}, ${input:id}, or {{var}} so they are never committed. See docs/spec/mcp.md.",
          evidence: [
            mcpEvidence(server),
            { kind: "field", value: credentialFields.join(",") },
          ],
          suggest: "Replace the literals with interpolated environment or secret references",
        }),
      );
    }
  }
  return out;
}
