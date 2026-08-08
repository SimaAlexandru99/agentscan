import { basename } from "node:path";
import type { Action, Facts, Finding } from "../facts/types";
import { DEP_SKILL_MAP } from "../rules/map";
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
  lines.push(`skillscan v${version} — ${name}`);
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
 * Only the deps skillscan actually reasons about (DEP_SKILL_MAP), plus a count
 * of the rest — a real app has 100+ dependencies and listing them all made this
 * line unreadable without telling the reader anything.
 */
function formatStack(facts: Facts): string {
  const versions = { ...facts.devDependencies, ...facts.dependencies };
  const known = [...new Set(DEP_SKILL_MAP.map((e) => e.dep))]
    .filter((dep) => dep in versions)
    .sort((a, b) => a.localeCompare(b));

  const parts = known.map((name) => `${name}@${versions[name]}`);
  const hidden = Object.keys(versions).length - known.length;
  if (hidden > 0) {
    parts.push(`+${hidden} more`);
  }
  parts.push(`packageManager=${facts.packageManager}`);
  return parts.join(" · ");
}

function formatFinding(f: Finding): string[] {
  const out: string[] = [];
  out.push(`${actionColumn(f.action)} ${f.subject}`);
  out.push(`        rule:${f.ruleId}`);
  out.push(`        ${f.message}`);
  if (f.evidence.length > 0) {
    const ev = f.evidence.map((e) => `${e.kind} ${e.value}`).join(" · ");
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

  const parts: string[] = [
    `${counts.delete} delete`,
    `${counts.add} add`,
    `${counts.refresh} refresh`,
    `${counts.drift} drift`,
    `${counts.warn} warn`,
  ];
  if (verbose || counts.keep > 0) {
    parts.push(`${counts.keep} keep`);
  }
  if (!verbose && infoHidden > 0) {
    parts.push(`${infoHidden} info hidden (--verbose)`);
  }

  return `Summary: ${parts.join(" · ")}`;
}
