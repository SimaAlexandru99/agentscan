import { checks, CITED_CHECKS } from "@/lib/checks";

/** Home copy from the approved mockup (Home.dc.html). */
export const BENEFITS = [
  {
    title: "Guards that stopped running, found",
    body: "A hook still registered after its script was deleted, or a hook under an event the agent never fires. The agent gives no warning; agentscan reports an error.",
  },
  {
    title: "MCP servers that can actually start",
    body: "Entries with no command or url, command paths that do not exist, and transports a vendor does not support, across 23 agents.",
  },
  {
    title: "Secrets kept out of config",
    body: "Literal tokens and Authorization headers in MCP config are flagged, with the field path only: the value is never printed.",
  },
  {
    title: "Skills and lockfiles that agree",
    body: "Locked skills that are not installed, installed skills that are not locked, broken references, and frontmatter the spec rejects.",
  },
  {
    title: "One command for every agent you use",
    body: "Claude Code, Codex, Cursor, Copilot, Gemini, Grok, Qwen, Factory Droid and more, read from the files each one documents.",
  },
  {
    title: "Safe to run anywhere, including CI",
    body: "No network, no writes, the same findings for the same tree. Fail a build on errors, or hand the report to a fixing agent with --output prompt.",
  },
] as const;

export const HOME_METRICS = [
  { value: "10", label: "real config problems found; 9 fixed the same day" },
  {
    value: "692 → 251",
    label: "findings on one home directory, once the tool’s own false alarms were removed",
  },
  { value: `${CITED_CHECKS} / ${checks.length}`, label: "checks cite the vendor page they come from" },
  { value: "46", label: "vendor pages re-read on 14 November 2026" },
] as const;

export type AgentExample = {
  name: string;
  files: ReadonlyArray<readonly [kind: string, path: string]>;
  sev: "ERROR" | "WARN";
  rule: string;
  msg: string;
};

export const AGENT_EXAMPLES: readonly AgentExample[] = [
  { name: "Claude Code", files: [["hooks", ".claude/settings.json"], ["mcp", ".mcp.json · ~/.claude.json"], ["skills", ".claude/skills"], ["agents", ".claude/agents"], ["rules", "CLAUDE.md"]], sev: "ERROR", rule: "claude.hook.missing-script", msg: "The guard you registered has not existed for weeks." },
  { name: "Claude Desktop", files: [["mcp", "claude_desktop_config.json"], ["ext", "Claude Extensions/<id>/manifest.json"]], sev: "WARN", rule: "mcp.literal-credential", msg: "An Authorization header is written into the config." },
  { name: "Codex", files: [["hooks", ".codex/hooks.json · config.toml"], ["mcp", "[mcp_servers]"], ["skills", ".agents/skills"], ["agents", ".codex/agents/*.toml"]], sev: "ERROR", rule: "codex.agent.missing-field", msg: "A custom agent without developer_instructions." },
  { name: "Cursor", files: [["hooks", ".cursor/hooks.json"], ["mcp", ".cursor/mcp.json"], ["rules", ".cursor/rules/*.mdc"]], sev: "ERROR", rule: "cursor.hook.missing-script", msg: "A hook that runs a script someone deleted." },
  { name: "Copilot", files: [["hooks", ".github/hooks/*.json"], ["mcp", ".github/mcp.json"], ["agents", ".github/agents/*.agent.md"]], sev: "WARN", rule: "copilot.hook.unknown-event", msg: "Notification is not documented; notification is." },
  { name: "Gemini CLI", files: [["hooks", ".gemini/settings.json"], ["rules", "GEMINI.md"]], sev: "ERROR", rule: "gemini.mcp.no-launch", msg: "A server with neither command, url nor httpUrl." },
  { name: "Grok Build", files: [["hooks", ".grok/hooks"], ["mcp", ".grok/config.toml"], ["skills", ".grok/skills"]], sev: "ERROR", rule: "grok.hook.unknown-event", msg: "StopCancelled is not a Grok Build event." },
  { name: "Qwen Code", files: [["hooks", ".qwen/settings.json"], ["skills", ".qwen/skills"]], sev: "ERROR", rule: "qwen.hook.unknown-event", msg: "A hook under an event Qwen never dispatches." },
  { name: "Factory Droid", files: [["mcp", ".factory/mcp.json"], ["hooks", ".factory/hooks.json"], ["agents", ".factory/droids"]], sev: "ERROR", rule: "factory.droid.invalid-name", msg: "A droid name the CLI will not load." },
  { name: "Zed", files: [["mcp", ".zed/settings.json (context_servers)"]], sev: "ERROR", rule: "security.hardcoded-secret", msg: "A GitHub token in plain text in editor settings." },
];

export const OTHER_AGENTS =
  "Also Antigravity, Windsurf, Devin CLI, Kiro, Command Code, OpenCode, Continue, Cline, Roo Code, Kilo Code and Junie.";

export const RUNS_NOTE =
  "Runs on the author's own setup: 4 machines (one Linux, three Windows) and 29 project checkouts, 13–14 November 2026. Project names withheld.";
