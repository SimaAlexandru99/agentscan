/**
 * Every id `runChecks` can emit — the whole of what this tool can report, and
 * what `agentscan rules` prints. Keep in sync with the functions below and in
 * budgets.ts; the `declared ids and emitted ids are the same set` test fails in
 * both directions if they drift.
 */
export const STRUCTURAL_CHECKS: { id: string; description: string }[] = [
  {
    id: "config.unreadable",
    description: "Config file is not valid JSON or cannot be read",
  },
  {
    id: "hook.unknown-event",
    description: "Hook registered under an event name that is never dispatched",
  },
  {
    id: "hook.missing-script",
    description: "Hook points at a script that does not exist, so it never runs",
  },
  {
    id: "skill.missing-skill-md",
    description: "Skill directory has no SKILL.md",
  },
  {
    id: "skill.missing-frontmatter",
    description: "SKILL.md has no YAML frontmatter block",
  },
  {
    id: "skill.missing-description",
    description: "SKILL.md frontmatter has no description (recommended field)",
  },
  {
    id: "skill.not-in-lock",
    description: "Skill on disk is not tracked by skills-lock.json",
  },
  {
    id: "skill.locked-not-installed",
    description: "skills-lock.json pins a skill that is not installed",
  },
  {
    id: "skill.broken-reference",
    description: "SKILL.md points at a bundled file that does not exist",
  },
  {
    id: "skill.duplicate-description",
    description: "Two or more skills share an identical description",
  },
  {
    id: "skill.description-budget",
    description: "Skill descriptions exceed the startup character budget",
  },
  {
    id: "skill.no-lockfile",
    description: "Skills present with no skills-lock.json (requireLock only)",
  },
  {
    id: "agent.missing-frontmatter",
    description: "Agent definition has no YAML frontmatter block",
  },
  {
    id: "agent.missing-description",
    description: "Agent frontmatter has no description",
  },
  { id: "agent.missing-name", description: "Agent frontmatter has no name" },
  { id: "agent.duplicate-name", description: "Agent names are duplicated" },
  { id: "agent.invalid-name", description: "Agent frontmatter name is not a valid identifier" },
  {
    id: "mcp.no-launch",
    description: "MCP server declares neither command nor url",
  },
  {
    id: "mcp.command-missing",
    description:
      "MCP server command is a path that does not exist on disk",
  },
  {
    id: "mcp.url-without-type",
    description: "Remote MCP server has a url but no transport type",
  },
  {
    id: "mcp.hardcoded-secret",
    description: "MCP config contains a token-shaped literal",
  },
  {
    id: "mcp.literal-env",
    description: "MCP env value is a long literal instead of ${VAR}",
  },
  // Budgets — see budgets.ts. Size judgements, all info, never build-failing.
  {
    id: "budget.agents-md",
    description:
      "AGENTS.md longer than the point where added lines stop helping (>150 lines)",
  },
  {
    id: "budget.claude-md",
    description:
      "CLAUDE.md longer than the instruction budget a model reliably follows (>200 lines)",
  },
  {
    id: "budget.agents",
    description:
      "More agent definitions than a focused set (>8 files in .claude/agents)",
  },
  {
    id: "budget.mcp",
    description:
      "Project MCP server count above the point where tool selection degrades",
  },
];
