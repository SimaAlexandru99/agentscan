export const SITE_ORIGIN = "https://agentscan.space";
export const SITE_LASTMOD = "2026-11-12";
export const PRODUCT_NAME = "agentscan";
export const PRODUCT_VERSION = "2.2.0";
// The published release, not the repo. The site advertises the package a
// visitor can install.
export const PRODUCT_CHECKS = 144;

/** Surfaces 2.0.0 reads, in the README coverage matrix. Not a card grid. */
export const COVERAGE_LINES = [
  "Codex: .codex/hooks.json and [hooks] in config.toml, and the same files under --global.",
  "Antigravity: rules, skills, and hooks. url is an alias of serverUrl.",
  "Cursor: ~/.cursor/hooks.json and ~/.cursor/mcp.json under --global.",
  "Gemini: hooks in .gemini/settings.json and in the user file under --global.",
  "Kiro: hooks, skills, and agents. SessionEnd, PreCompact, and PostCompact are triggers.",
  "Devin CLI: hooks, MCP, and skills, beside the Windsurf contract.",
  "Copilot: user mcp-config.json under --global.",
  "Cline, Roo, Kilo, and Junie skill directories.",
  "VS Code: .github/agents/*.agent.md frontmatter hooks.",
  "Claude: user hooks, MCP, and agents under --global. CLAUDE_CONFIG_DIR also moves ~/.claude.json.",
  "Every finding carries provenance.",
] as const;

export const GLOBAL_FLAG_MEANING =
  "Also open documented user locations: Claude, Codex, Command Code, Cursor hooks and mcp.json, Gemini settings, Copilot mcp-config.json, Kiro, Devin CLI, Antigravity, and Cline, Roo, Kilo, and Junie skill directories. The README coverage matrix lists every path.";

export const BREAKING_NOTE =
  "2.0.0 accepts only printed rule ids in ignoreRules, ignoreFindings, and explain. thresholds.skillDescriptionBytes and thresholds.skills are rejected; the listing budget is thresholds.skillListingChars.";

export const STILL_UNREAD =
  "Still unread: Cline hooks and agents, ~/.cursor/skills/, OpenCode's global config, ~/.continue/config.yaml, Windsurf auto-generated memories, Copilot policy hooks, and plugin hooks.json. .claude/settings.json stays Claude. Antigravity httpUrl does not launch a server. Kiro agents are inventory only and add no rule id.";
export const NPM_PACKAGE = "@chimix/agentscan";
export const GITHUB_REPO = "https://github.com/SimaAlexandru99/agentscan";
export const GITHUB_ISSUES = `${GITHUB_REPO}/issues`;
export const NPM_URL = "https://www.npmjs.com/package/@chimix/agentscan";
export const RUN_COMMAND = "npx @chimix/agentscan@latest";
export const CHECK_COMMAND = "npx @chimix/agentscan check";

export const INDEXABLE_PATHS = [
  "/",
  "/docs",
  "/about",
  "/contact",
  "/privacy",
] as const;

export type IndexablePath = (typeof INDEXABLE_PATHS)[number];

export function absoluteUrl(path: string): string {
  if (path === "/") {
    return `${SITE_ORIGIN}/`;
  }
  return `${SITE_ORIGIN}${path}`;
}
