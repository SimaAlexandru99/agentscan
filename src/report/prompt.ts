import { basename } from "node:path";
import type { Facts, Finding, Severity } from "../facts/types";
import { safe } from "./safe";
import { score } from "./score";
import { sortFindings } from "./sort";

/**
 * A paste-ready handoff for an agent that will fix the findings.
 *
 * Different from the text report, which is for a person deciding what to care
 * about, and from `--json`, which is for a program. This one is for a model
 * that is about to edit files: it carries the reason (so a judgement call lands
 * the right way), the suggestion, and the finding id (so the honest answer to a
 * false positive is suppression rather than a guess).
 *
 * Info-severity findings are left out on purpose. They are budgets and hygiene
 * notes — things for a maintainer to weigh, not work items. Handing them to an
 * executor invites churn on advice that was never a defect.
 */
export function renderPrompt(args: {
  version: string;
  facts: Facts;
  findings: Finding[];
}): string {
  const { version, facts } = args;
  const actionable = sortFindings(args.findings).filter(
    (f) => f.severity !== "info",
  );
  const project = basename(facts.root) || facts.root;

  if (actionable.length === 0) {
    return [
      `# agentscan v${version} — ${safe(project)}`,
      "",
      "No findings, score 100/100. The agent configuration in this project is intact;",
      "there is nothing to fix.",
      "",
    ].join("\n");
  }

  const lines: string[] = [
    `# Fix the agent configuration in ${safe(project)}`,
    "",
    `\`agentscan\` v${version} scores this project ${score(args.findings)}/100 and found`,
    `${actionable.length} ${actionable.length === 1 ? "issue" : "issues"} in its agent configuration —`,
    "hooks, MCP servers, skills, agent definitions. Each one below is a config file",
    "saying something that is not true of the filesystem.",
    "",
    "## Work items",
    "",
  ];

  for (const group of ["error", "warning"] as const) {
    const items = actionable.filter((f) => f.severity === group);
    if (items.length === 0) {
      continue;
    }
    lines.push(`### ${headingFor(group)}`, "");
    for (const f of items) {
      lines.push(`- **${safe(f.message)}**`);
      lines.push(`  - Why it matters: ${safe(f.reason)}`);
      if (f.suggest !== undefined && f.suggest.length > 0) {
        lines.push(`  - Suggested fix: ${safe(f.suggest)}`);
      }
      for (const e of f.evidence) {
        lines.push(`  - ${safe(e.kind)}: \`${safe(e.value)}\``);
      }
      lines.push(`  - Finding id: \`${safe(f.id)}\``);
      lines.push("");
    }
  }

  lines.push(
    "## Rules for this work",
    "",
    "- Fix the configuration, not the report. Do not silence a finding by deleting the",
    "  file it names unless that is genuinely the right fix — several of these name a",
    "  guard hook or a pinned skill that someone wanted.",
    "- If a finding is wrong for this project, do not work around it: add its id to",
    "  `ignoreFindings` in `.agentscanrc.json` and say why in the commit.",
    "- Change nothing this list does not mention.",
    "",
    "## Verify",
    "",
    "```bash",
    "agentscan check --fail-on error",
    "```",
    "",
    "Exit 0 means every error-severity item above is resolved. Re-read the report",
    "rather than trusting the exit code alone — a fix that removes the file instead",
    "of repairing it also exits 0.",
    "",
  );

  return lines.join("\n");
}

function headingFor(severity: Severity): string {
  return severity === "error"
    ? "Broken — something configured here does not work"
    : "Wrong — the config and the filesystem disagree";
}
