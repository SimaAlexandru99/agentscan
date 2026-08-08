import { basename } from "node:path";
import type { Action, Facts, Finding } from "../facts/types";
import { buildOrphanSummary } from "./orphan-summary";
import { sortFindings } from "./sort";

const ORPHAN_RULE = "skill.orphan";

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

  // Default / quiet: hide KEEP, info severity, and skill.orphan (collapsed separately).
  // Verbose: full listing including orphans; no ORPHAN summary line.
  const visible = verbose
    ? sorted
    : sorted.filter(
        (f) =>
          f.action !== "keep" &&
          f.severity !== "info" &&
          f.ruleId !== ORPHAN_RULE,
      );

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

  if (!verbose) {
    const orphanLine = buildOrphanSummary(sorted);
    if (orphanLine !== null) {
      lines.push(orphanLine);
      lines.push("");
    }
  }

  lines.push(summary);
  lines.push("");
  return lines.join("\n");
}

function projectLabel(root: string): string {
  const base = basename(root);
  return base.length > 0 ? base : root;
}

function formatStack(facts: Facts): string {
  const versions = {
    ...facts.devDependencies,
    ...facts.dependencies,
  };
  const parts = Object.keys(versions)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => `${name}@${versions[name]}`);
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
      // skill.orphan collapsed into ORPHAN line (default) or omitted (quiet);
      // never inflate "info hidden".
      if (f.ruleId === ORPHAN_RULE) {
        continue;
      }
      infoHidden += 1;
      continue;
    }
    counts[f.action] += 1;
  }

  // Spec §11: Summary: 2 delete · 1 add · 0 drift · 1 warn
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
