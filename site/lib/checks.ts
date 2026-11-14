import checks from "@/data/checks.json";

export type SiteCheck = (typeof checks)[number];

export { checks };

/** First id segment → the agent or group the filter shows. */
const FAMILY_NAMES: Record<string, string> = {
  claude: "Claude Code",
  "claude-desktop": "Claude Desktop",
  codex: "Codex",
  cursor: "Cursor",
  copilot: "Copilot CLI",
  vscode: "VS Code",
  gemini: "Gemini CLI",
  antigravity: "Antigravity",
  grok: "Grok Build",
  windsurf: "Windsurf",
  devin: "Devin CLI",
  kiro: "Kiro",
  commandcode: "Command Code",
  opencode: "OpenCode",
  continue: "Continue",
  qwen: "Qwen Code",
  factory: "Factory Droid",
  zed: "Zed",
  amp: "Amp",
  goose: "Goose",
  "agent-skills": "Agent Skills",
  skill: "Skills and lockfiles",
  mcp: "MCP (any agent)",
  security: "Security",
  budget: "Budgets",
  config: "General",
  scan: "General",
};

export function checkFamily(id: string): string {
  return FAMILY_NAMES[id.split(".")[0] ?? ""] ?? "General";
}

export const CHECK_FAMILIES = Array.from(
  new Set(checks.map((check) => checkFamily(check.id))),
).sort();

export const CITED_CHECKS = checks.filter((check) => check.sourceUrl !== null).length;

export const PROVENANCE_SPLIT = (
  [
    ["spec-required", "spec-required"],
    ["internal-consistency", "config against the disk"],
    ["vendor-recommendation", "vendor recommendations"],
    ["heuristic", "heuristics, info only"],
    ["security", "security"],
  ] as const
).map(([provenance, label]) => ({
  provenance,
  label,
  count: checks.filter((check) => check.provenance === provenance).length,
}));

/** /checks "Common symptoms": what a user sees → the rule that explains it. */
export const SYMPTOMS = [
  ["Hook script not found (exit 127)", "claude.hook.missing-script"],
  ["MCP server failed to start", "mcp.command-missing"],
  ["Plaintext token in mcp.json", "security.hardcoded-secret"],
] as const;
