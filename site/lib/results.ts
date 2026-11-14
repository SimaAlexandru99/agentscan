/** /results copy, verbatim from the owner-approved mockup (Results.dc.html). */
export const RESULTS_TITLE = "Results from a real agentscan run";
export const RESULTS_H1 = "Real agentscan results: hooks silently ignored, configs that would not load";

export const RESULTS_INTRO =
  "On 13–14 November 2026 agentscan ran over the author's own agent setup: four machines (one Linux, three Windows), their global config for every installed agent, and 29 project checkouts. Below is each real problem it reported, what was done about it, and what the run taught us about agentscan itself. Project names are withheld; no secret is shown.";

export const RESULTS_SUMMARY = [
  { value: "10", label: "real problems reported" },
  { value: "9", label: "fixed the same day" },
  { value: "2", label: "plaintext secrets found in config files" },
  { value: "0", label: "network calls during check" },
] as const;

export type ResultCase = {
  count: string;
  title: string;
  why: string;
  rule: string;
  action: string;
  state: "fixed" | "in progress";
};

export const RESULT_CASES: readonly ResultCase[] = [
  { count: "1", title: "A Cursor hook that ran a deleted script", why: "The hook stayed registered after the script it calls was removed, so it failed on every matching edit without a word.", rule: "cursor.hook.missing-script", action: "Removed the dead hook entry.", state: "fixed" },
  { count: "1", title: "A skill link pointing at a skill that was removed", why: "The skill had been deleted on purpose; its symlink and lockfile entry were left behind.", rule: "skill.locked-not-installed", action: "Removed the link and the lock entry.", state: "fixed" },
  { count: "3", title: "Subagents whose frontmatter was not valid YAML", why: "An unquoted \"tier: …\" in a description is a nested mapping to a strict parser, so the definition was unreadable.", rule: "config.unreadable", action: "Quoted the three descriptions.", state: "fixed" },
  { count: "3", title: "Lockfile entries for skills no longer installed", why: "Upstream renamed or dropped the skills; the lock still pinned the old names in two projects.", rule: "skill.locked-not-installed", action: "Dropped the stale entries.", state: "fixed" },
  { count: "1", title: "A GitHub token in plain text in editor settings", why: "An MCP extension stored a classic personal access token in the settings file.", rule: "security.hardcoded-secret", action: "Replaced with a server that reads the token from the environment.", state: "fixed" },
  { count: "1", title: "An Authorization header written into a desktop app config", why: "A remote MCP server carried its bearer token in the app’s JSON config.", rule: "mcp.literal-credential", action: "Moving it to the app’s connector settings, which keep the token server-side.", state: "in progress" },
];

export const RESULTS_LEFT_ALONE =
  "Also reported and left alone: a hook registered under an event the agent never fires, written into a global config by a separate orchestration tool. It is that tool's file to change.";

export const RESULTS_LESSONS_INTRO =
  "A linter that cries wolf gets switched off. The same run, pointed at one home directory, first produced 692 findings. Most were agentscan's own mistakes. Each one was traced, fixed with a regression test, and shipped between 2.1.0 and 2.3.1.";

export const FINDINGS_BEFORE = 692;
export const FINDINGS_AFTER = 251;
export const ERRORS_LINE = "errors on the same scan: 406 → 40";

export const RESULT_LESSONS = [
  "The user agents folder was read twice when the scan root was the home directory, so every agent was its own duplicate.",
  "A quoted script path such as \"${CLAUDE_PLUGIN_ROOT}/scripts/x\" was reported missing although the file existed.",
  "Permission-denied container volumes were reported as broken config files.",
  "A lockfile inside a worktree looked for its skills in the wrong place.",
  "The subagent name rule was older than the vendor’s current page and rejected names like i18n-reviewer.",
  "Codex’s own [hooks.state] trust records and Zed’s extension-provided servers were misread as broken entries.",
] as const;

export const RESULTS_CTA = "Run it on your own setup. Add --global to include every agent's user config.";
export const RESULTS_CTA_COMMAND = "npx @chimix/agentscan check --global";
export const RESULTS_FOOTNOTE =
  "Figures from agentscan 2.0.0 to 2.3.1 on the author's machines, 13–14 November 2026.";
