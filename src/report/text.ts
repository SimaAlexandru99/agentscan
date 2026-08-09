import { basename } from "node:path";
import type { Action, Facts, Finding } from "../facts/types";
import { safe } from "./safe";
import { sortFindings } from "./sort";

const ACTION_LABEL: Record<Action, string> = {
  keep: "KEEP",
  delete: "DELETE",
  add: "ADD",
  refresh: "REFRESH",
  warn: "WARN",
  drift: "DRIFT",
};

/** Left-pad action label to 7 chars for column alignment (DELETE = 6). */
function actionColumn(action: Action): string {
  return ACTION_LABEL[action].padEnd(7, " ");
}

export function renderText(args: {
  version: string;
  facts: Facts;
  findings: Finding[];
  resolvedFrom?: string;
  verbose: boolean;
  quiet: boolean;
}): string {
  const { version, facts, verbose, quiet } = args;
  const sorted = sortFindings(args.findings);

  // Default / quiet: hide KEEP and info severity. Verbose: full listing.
  const visible = verbose
    ? sorted
    : sorted.filter((f) => f.action !== "keep" && f.severity !== "info");

  const summary = formatSummary(sorted, verbose);

  if (quiet) {
    return `${summary}\n`;
  }

  const lines: string[] = [];
  const name = projectLabel(facts.root);
  lines.push(`agentscan v${version} — ${safe(name)}`);
  if (args.resolvedFrom !== undefined) {
    // The scan silently targeting an ancestor is worse than it refusing to run.
    lines.push(
      `       no package.json in ${safe(args.resolvedFrom)} — scanned ${safe(facts.root)}`,
    );
  }
  lines.push("");
  lines.push(`Stack: ${formatStack(facts)}`);
  lines.push("");

  for (const f of visible) {
    lines.push(...formatFinding(f));
    lines.push("");
  }

  lines.push(summary);
  lines.push("");
  return lines.join("\n");
}

function projectLabel(root: string): string {
  const base = basename(root);
  return base.length > 0 ? base : root;
}

/**
 * Orientation only — which project is this and how big. Listing dependencies
 * here told the reader nothing about their agent config, and a real app has
 * 100+ of them.
 */
function formatStack(facts: Facts): string {
  const deps =
    Object.keys(facts.dependencies).length +
    Object.keys(facts.devDependencies).length;
  const global = facts.skills.filter((s) => s.source === "global").length;
  const skills =
    global === 0
      ? `${facts.skills.length} skills`
      : `${facts.skills.length} skills (${facts.skills.length - global} project + ${global} global)`;
  return [
    `${deps} deps`,
    skills,
    `${facts.mcp.length} mcp`,
    `${facts.agents.length} agents`,
    `packageManager=${facts.packageManager}`,
  ].join(" · ");
}

function formatFinding(f: Finding): string[] {
  const out: string[] = [];
  out.push(`${actionColumn(f.action)} ${safe(f.subject)}`);
  out.push(`        rule:${safe(f.ruleId)}`);
  out.push(`        ${safe(f.message)}`);
  if (f.evidence.length > 0) {
    const ev = f.evidence
      .map((e) => `${safe(e.kind)} ${safe(e.value)}`)
      .join(" · ");
    out.push(`        evidence: ${ev}`);
  }
  return out;
}

function formatSummary(findings: Finding[], verbose: boolean): string {
  const counts: Record<Action, number> = {
    keep: 0,
    delete: 0,
    add: 0,
    refresh: 0,
    warn: 0,
    drift: 0,
  };
  let infoHidden = 0;
  for (const f of findings) {
    if (!verbose && f.severity === "info") {
      infoHidden += 1;
      continue;
    }
    counts[f.action] += 1;
  }

  // Only non-zero actions — most rule sets never emit most actions, and a row of
  // permanent zeros buried the one number that moved.
  const order: Action[] = ["delete", "add", "refresh", "drift", "warn", "keep"];
  const parts = order
    .filter((action) => counts[action] > 0)
    .map((action) => `${counts[action]} ${action}`);

  if (!verbose && infoHidden > 0) {
    parts.push(`${infoHidden} info hidden (--verbose)`);
  }
  if (parts.length === 0) {
    return "Summary: no findings";
  }

  return `Summary: ${parts.join(" · ")}`;
}
