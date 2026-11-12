import type { Facts } from "../facts/types";
import { type Finding, isMetricEvidence, type Severity } from "../findings";
import { type Paint, type Tone, paint } from "./ansi";
import { provenanceLine } from "./provenance-line";
import { safe } from "./safe";
import { projectLabel, type Summary, summarize } from "./summary";

const SEVERITY_LABEL: Record<Severity, string> = {
  error: "ERROR",
  warning: "WARN",
  info: "INFO",
};

function severityColumn(severity: Severity): string {
  return SEVERITY_LABEL[severity].padEnd(7, " ");
}

export function renderText(args: {
  version: string;
  facts: Facts;
  findings: Finding[];
  resolvedFrom?: string;
  verbose: boolean;
  quiet: boolean;
  colour?: boolean;
}): string {
  const { version, facts, verbose, quiet } = args;
  const ink = paint(args.colour === true);
  const summarized = summarize(args.findings, { verbose });
  const summary = formatSummary(summarized, ink);

  if (quiet) {
    return `${summary}\n`;
  }

  const lines: string[] = [];
  const name = projectLabel(facts.root);
  if (ink.enabled) {
    lines.push(...formatHeaderBox(summarized, safe(name), ink));
  }
  lines.push(
    ink.dim(`agentscan v${version} — ${safe(name)}`),
  );
  if (args.resolvedFrom !== undefined) {
    lines.push(
      `       no package.json in ${safe(args.resolvedFrom)} — scanned ${safe(facts.root)}`,
    );
  }
  lines.push("");
  lines.push(ink.dim(`Scanned: ${formatStack(facts)}`));
  lines.push("");

  for (const group of groupByRule(summarized.visible)) {
    lines.push(...formatGroup(group, facts.root, ink, verbose));
    lines.push("");
  }

  lines.push(summary);
  lines.push("");
  return lines.join("\n");
}

const BAR_CELLS = 25;

/**
 * The face, the score and a bar — the verdict before any reading.
 *
 * Terminal only. Piped output has no header at all, so `--json`, `--output
 * prompt` and a redirected report stay exactly what they were, and the box
 * glyphs never land in a CI log that may not render them.
 *
 * No terminal-width probing: react-doctor reflows because it runs a live TUI,
 * while this prints once and exits, so a fixed bar is one less thing to get
 * wrong on a resize that will never happen.
 */
function formatHeaderBox(summary: Summary, name: string, ink: Paint): string[] {
  const points = summary.score;
  const { tone, label, face: [eyes, mouth] } = summary.band;
  const filled = Math.round((points / 100) * BAR_CELLS);
  const bar =
    ink.tone(tone, "█".repeat(filled)) + ink.dim("░".repeat(BAR_CELLS - filled));

  const verdict = `${ink.strong(tone, `${points}/100`)}  ${ink.tone(tone, label)}${ink.dim(`  ·  ${name}`)}`;

  return [
    `  ${ink.tone(tone, "┌─────┐")}   ${verdict}`,
    `  ${ink.tone(tone, `│ ${eyes} │`)}   ${bar}`,
    `  ${ink.tone(tone, `│ ${mouth} │`)}   ${ink.dim(countsLine(summary))}`,
    `  ${ink.tone(tone, "└─────┘")}`,
    "",
  ];
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

/**
 * Findings sharing a rule id, in first-seen order.
 *
 * One project had six dead hooks, and the report spent twenty-four lines saying
 * the same sentence six times with a different filename in it. The rule fires
 * once per broken thing by design — the ids have to stay unique for `explain`
 * and `ignoreFindings` — so the collapsing belongs here, at render time.
 */
function groupByRule(findings: Finding[]): Finding[][] {
  const byRule = new Map<string, Finding[]>();
  for (const f of findings) {
    const bucket = byRule.get(f.ruleId);
    if (bucket === undefined) {
      byRule.set(f.ruleId, [f]);
    } else {
      bucket.push(f);
    }
  }
  return [...byRule.values()];
}

/**
 * Paths inside the scanned project, shown relative to it.
 *
 * A global replace rather than a prefix strip: evidence values are composed
 * strings like `PreToolUse @ /abs/path/.claude/settings.json`, so the path sits
 * in the middle. Everything outside the project keeps its absolute path, which
 * is the point — a global skill lives elsewhere and should look like it does.
 */
function shortPath(value: string, root: string): string {
  return value.split(`${root}/`).join("");
}

const SEVERITY_TONE: Record<Severity, Tone | undefined> = {
  error: "red",
  warning: "yellow",
  info: undefined,
};

function formatGroup(
  group: Finding[],
  root: string,
  ink: Paint,
  verbose: boolean,
): string[] {
  const first = group[0] as Finding;
  const count = group.length;
  const out: string[] = [];

  const tone = SEVERITY_TONE[first.severity];
  const label = severityColumn(first.severity);
  out.push(
    `${tone === undefined ? ink.dim(label) : ink.tone(tone, label)} ${ink.dim(`rule:${safe(first.ruleId)}`)}${count > 1 ? ink.bold(`  ×${count}`) : ""}`,
  );
  out.push(`        ${safe(count === 1 ? first.message : groupHeadline(group))}`);

  for (const f of group) {
    const where = f.evidence
      .filter((e) => !isMetricEvidence(e))
      .map((e) => shortPath(e.value, root));
    const location = where.length > 0 ? where.join(" · ") : f.subject;
    out.push(ink.dim(`          ${safe(shortPath(location, root))}`));
    if (verbose) {
      out.push(ink.dim(`            id: ${safe(f.id)}`));
    }
  }
  out.push(ink.dim(`        ${safe(provenanceLine(first))}`));
  return out;
}

/**
 * Shared sentence for a collapsed group. Must not name one event when the group
 * spans several (e.g. PreToolUse + SessionStart) — that was a lie in the report.
 */
function groupHeadline(group: Finding[]): string {
  const stripped = group.map((f) => {
    const cut = f.message.indexOf(": ");
    return cut === -1 ? f.message : f.message.slice(0, cut);
  });
  if (new Set(stripped).size === 1) {
    return stripped[0] as string;
  }
  const deEvented = stripped.map((s) =>
    s.replace(/^[A-Za-z][A-Za-z0-9]* hook /, "Hook "),
  );
  if (new Set(deEvented).size === 1) {
    return deEvented[0] as string;
  }
  return `${group.length} findings`;
}

function countsLine(summary: Summary): string {
  const parts = severityParts(summary);
  return parts.length === 0 ? "no findings" : parts.join(" · ");
}

function severityParts(summary: Summary): string[] {
  const shown = { ...summary.counts, info: summary.counts.info - summary.infoHidden };
  const parts = (["error", "warning", "info"] as const)
    .filter((severity) => shown[severity] > 0)
    .map((severity) => `${shown[severity]} ${severity}`);
  if (summary.infoHidden > 0) {
    parts.push(`${summary.infoHidden} info hidden (--verbose)`);
  }
  return parts;
}

function formatSummary(summary: Summary, ink: Paint): string {
  const parts = severityParts(summary);
  const scored = `score ${ink.tone(summary.band.tone, `${summary.score}/100 ${summary.band.label}`)}`;
  if (parts.length === 0) {
    return `Summary: no findings · ${scored}`;
  }

  return `Summary: ${parts.join(" · ")} · ${scored}`;
}
