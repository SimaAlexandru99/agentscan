import type { StructuralCheck } from "./provenance";

/**
 * Every id `runChecks` can emit — the whole of what this tool can report, and
 * what `agentscan rules` prints. Keep in sync with the functions in this
 * directory; the `declared ids and emitted ids are the same set` test fails
 * in both directions if they drift.
 */
export const STRUCTURAL_CHECKS: StructuralCheck[] = [
  {
    id: "config.unreadable",
    description: "Config file is not valid JSON or cannot be read",
    provenance: "internal-consistency",
    lastVerified: "2026-08-30",
  },
  {
    id: "scan.truncated",
    description:
      "File is larger than the scan cap, so body checks read only a prefix of it",
    provenance: "internal-consistency",
    lastVerified: "2026-08-30",
  },
  {
    id: "claude.hook.unknown-event",
    description: "Hook registered under an event name that is never dispatched",
    provenance: "spec-required",
    lastVerified: "2026-08-30",
  },
  {
    id: "claude.hook.missing-script",
    description: "Hook points at a script that does not exist, so it never runs",
    provenance: "internal-consistency",
    lastVerified: "2026-08-30",
  },
  {
    id: "vscode.hook.unknown-event",
    description: "VS Code hook registered under an event name that is never dispatched",
    provenance: "spec-required",
    lastVerified: "2026-08-30",
  },
  {
    id: "vscode.hook.missing-script",
    description: "VS Code hook points at a script that does not exist, so it never runs",
    provenance: "internal-consistency",
    lastVerified: "2026-08-30",
  },
  {
    id: "claude.hook.invalid-group",
    description: "Claude hook group has a matcher but no hooks array",
    provenance: "internal-consistency",
    lastVerified: "2026-08-30",
  },
  {
    id: "claude.hook.command-without-command",
    description: "Claude command hook is missing the command field",
    provenance: "spec-required",
    lastVerified: "2026-08-30",
  },
  {
    id: "claude.hook.http-without-url",
    description: "Claude http hook is missing the url field",
    provenance: "spec-required",
    lastVerified: "2026-08-30",
  },
  {
    id: "claude.hook.mcp-tool-without-name",
    description: "Claude MCP tool hook is missing the tool name",
    provenance: "spec-required",
    lastVerified: "2026-08-30",
  },
  {
    id: "claude.hook.unknown-handler-type",
    description: "Claude hook uses a handler type that is not command, http, mcp_tool, prompt, or agent",
    provenance: "spec-required",
    lastVerified: "2026-08-30",
  },
  {
    id: "vscode.hook.invalid-group",
    description: "VS Code hook group has a matcher but no hooks array",
    provenance: "internal-consistency",
    lastVerified: "2026-08-30",
  },
  {
    id: "vscode.hook.command-without-command",
    description: "VS Code command hook is missing the command field",
    provenance: "spec-required",
    lastVerified: "2026-08-30",
  },
  {
    id: "vscode.hook.http-without-url",
    description: "VS Code http hook is missing the url field",
    provenance: "spec-required",
    lastVerified: "2026-08-30",
  },
  {
    id: "vscode.hook.mcp-tool-without-name",
    description: "VS Code MCP tool hook is missing the tool name",
    provenance: "spec-required",
    lastVerified: "2026-08-30",
  },
  {
    id: "vscode.hook.unknown-handler-type",
    description: "VS Code hook uses an unknown handler type",
    provenance: "spec-required",
    lastVerified: "2026-08-30",
  },
  {
    id: "skill.missing-skill-md",
    description: "Skill directory has no SKILL.md",
    provenance: "internal-consistency",
    lastVerified: "2026-08-30",
  },
  {
    id: "claude.skill.missing-frontmatter",
    description: "SKILL.md has no YAML frontmatter block",
    provenance: "spec-required",
    lastVerified: "2026-08-30",
  },
  {
    id: "claude.skill.missing-description",
    description: "SKILL.md frontmatter has no description (recommended field)",
    provenance: "vendor-recommendation",
    lastVerified: "2026-08-30",
  },
  {
    id: "agent-skills.skill.missing-frontmatter",
    description: "Portable skill SKILL.md has no YAML frontmatter block",
    provenance: "spec-required",
    lastVerified: "2026-08-30",
  },
  {
    id: "agent-skills.skill.missing-name",
    description: "Portable skill frontmatter has no required name",
    provenance: "spec-required",
    lastVerified: "2026-08-30",
  },
  {
    id: "agent-skills.skill.missing-description",
    description: "Portable skill frontmatter has no required description",
    provenance: "spec-required",
    lastVerified: "2026-08-30",
  },
  {
    id: "agent-skills.skill.invalid-name",
    description: "Portable skill name is not a valid identifier",
    provenance: "spec-required",
    lastVerified: "2026-08-30",
  },
  {
    id: "agent-skills.skill.name-does-not-match-directory",
    description: "Portable skill name does not match its directory",
    provenance: "spec-required",
    lastVerified: "2026-08-30",
  },
  {
    id: "agent-skills.skill.name-too-long",
    description: "Portable skill name exceeds 64 characters",
    provenance: "spec-required",
    lastVerified: "2026-08-30",
  },
  {
    id: "agent-skills.skill.description-too-long",
    description: "Portable skill description exceeds 1024 characters",
    provenance: "spec-required",
    lastVerified: "2026-08-30",
  },
  {
    id: "skill.not-in-lock",
    description: "Skill on disk is not tracked by skills-lock.json",
    provenance: "heuristic",
    lastVerified: "2026-08-30",
  },
  {
    id: "skill.locked-not-installed",
    description: "skills-lock.json pins a skill that is not installed",
    provenance: "internal-consistency",
    lastVerified: "2026-08-30",
  },
  {
    id: "skill.broken-reference",
    description: "SKILL.md points at a bundled file that does not exist",
    provenance: "internal-consistency",
    lastVerified: "2026-08-30",
  },
  {
    id: "skill.duplicate-description",
    description: "Two or more skills share an identical description",
    provenance: "heuristic",
    lastVerified: "2026-08-30",
  },
  {
    id: "skill.description-budget",
    description: "Skill descriptions exceed the startup character budget",
    provenance: "heuristic",
    lastVerified: "2026-08-30",
  },
  {
    id: "skill.no-lockfile",
    description: "Skills present with no skills-lock.json (requireLock only)",
    provenance: "heuristic",
    lastVerified: "2026-08-30",
  },
  {
    id: "claude.agent.missing-frontmatter",
    description: "Agent definition has no YAML frontmatter block",
    provenance: "spec-required",
    lastVerified: "2026-08-30",
  },
  {
    id: "claude.agent.missing-description",
    description: "Agent frontmatter has no description",
    provenance: "spec-required",
    lastVerified: "2026-08-30",
  },
  {
    id: "claude.agent.missing-name",
    description: "Agent frontmatter has no name",
    provenance: "spec-required",
    lastVerified: "2026-08-30",
  },
  {
    id: "claude.agent.duplicate-name",
    description: "Agent names are duplicated",
    provenance: "spec-required",
    lastVerified: "2026-08-30",
  },
  {
    id: "claude.agent.invalid-name",
    description: "Agent frontmatter name is not a valid identifier",
    provenance: "spec-required",
    lastVerified: "2026-08-30",
  },
  {
    id: "claude.mcp.no-launch",
    description: "MCP server declares neither command nor url",
    provenance: "spec-required",
    lastVerified: "2026-08-30",
  },
  {
    id: "vscode.mcp.no-launch",
    description: "VS Code MCP server declares neither command nor url",
    provenance: "spec-required",
    lastVerified: "2026-08-30",
  },
  {
    id: "cursor.mcp.no-launch",
    description: "Cursor MCP server declares neither command nor url",
    provenance: "spec-required",
    lastVerified: "2026-08-30",
  },
  {
    id: "antigravity.mcp.no-launch",
    description: "Antigravity MCP server declares neither command nor serverUrl",
    provenance: "spec-required",
    lastVerified: "2026-08-30",
  },
  {
    id: "codex.mcp.no-launch",
    description: "Codex MCP server declares neither command nor url",
    provenance: "spec-required",
    lastVerified: "2026-08-30",
  },
  {
    id: "gemini.mcp.no-launch",
    description: "Gemini MCP server declares neither command, url, nor httpUrl",
    provenance: "spec-required",
    lastVerified: "2026-08-30",
  },
  {
    id: "opencode.mcp.no-launch",
    description: "OpenCode MCP server declares neither command nor url",
    provenance: "spec-required",
    lastVerified: "2026-08-30",
  },
  {
    id: "opencode.mcp.missing-type",
    description: "OpenCode MCP server is missing type local or remote",
    provenance: "spec-required",
    lastVerified: "2026-08-30",
  },
  {
    id: "opencode.mcp.local-without-command",
    description: "OpenCode local MCP server declares no command",
    provenance: "spec-required",
    lastVerified: "2026-08-30",
  },
  {
    id: "opencode.mcp.remote-without-url",
    description: "OpenCode remote MCP server declares no url",
    provenance: "spec-required",
    lastVerified: "2026-08-30",
  },
  {
    id: "opencode.mcp.invalid-launch-for-type",
    description: "OpenCode MCP server launch field does not match its type",
    provenance: "spec-required",
    lastVerified: "2026-08-30",
  },
  {
    id: "continue.mcp.no-launch",
    description: "Continue MCP server declares neither command, url, nor uses",
    provenance: "spec-required",
    lastVerified: "2026-08-30",
  },
  {
    id: "mcp.command-missing",
    description: "MCP server command is a path that does not exist on disk",
    provenance: "internal-consistency",
    lastVerified: "2026-08-30",
  },
  {
    id: "claude.mcp.url-without-type",
    description: "Remote MCP server has a url but no transport type",
    provenance: "spec-required",
    lastVerified: "2026-08-30",
  },
  {
    id: "security.hardcoded-secret",
    description: "MCP config contains a token-shaped literal",
    provenance: "security",
    lastVerified: "2026-08-30",
  },
  {
    id: "mcp.literal-env",
    description: "MCP env value is a literal secret-shaped key instead of interpolation",
    provenance: "security",
    lastVerified: "2026-08-30",
  },
  {
    id: "budget.agents-md",
    description:
      "AGENTS.md longer than the heuristic line budget (>150 lines)",
    provenance: "heuristic",
    lastVerified: "2026-08-30",
  },
  {
    id: "budget.claude-md",
    description:
      "CLAUDE.md longer than the documented size target (~200 lines)",
    provenance: "vendor-recommendation",
    lastVerified: "2026-08-30",
  },
  {
    id: "budget.agents",
    description:
      "More agent definitions than a focused set (>8 files in .claude/agents)",
    provenance: "heuristic",
    lastVerified: "2026-08-30",
  },
  {
    id: "budget.mcp",
    description:
      "Project MCP server count above the point where tool selection may degrade",
    provenance: "heuristic",
    lastVerified: "2026-08-30",
  },
  {
    id: "codex.budget.instructions",
    description:
      "Codex AGENTS.md chain exceeds project_doc_max_bytes (32 KiB default)",
    provenance: "vendor-recommendation",
    lastVerified: "2026-08-30",
  },
  {
    id: "cursor.rule.too-large",
    description: "Cursor project rule exceeds the 500-line recommendation",
    provenance: "vendor-recommendation",
    lastVerified: "2026-08-30",
  },
];
