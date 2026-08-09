import { basename } from "node:path";
import type { Action, Facts, Finding } from "../facts/types";
import { type Paint, type Tone, paint } from "./ansi";
import { safe } from "./safe";
import { score, scoreFace, scoreLabel, scoreTone } from "./score";
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
  /** Emit ANSI colour and the header box. Off means byte-for-byte plain text. */
  colour?: boolean;
}): string {
  const { version, facts, verbose, quiet } = args;
  const ink = paint(args.colour === true);
  const sorted = sortFindings(args.findings);

  // Default / quiet: hide KEEP and info severity. Verbose: full listing.
  const visible = verbose
    ? sorted
    : sorted.filter((f) => f.action !== "keep" && f.severity !== "info");

  const summary = formatSummary(sorted, verbose, ink);

  if (quiet) {
    return `${summary}\n`;
  }

  const lines: string[] = [];
  const name = projectLabel(facts.root);
  if (ink.enabled) {
    lines.push(...formatHeaderBox(sorted, verbose, safe(name), ink));
  }
  lines.push(
    ink.dim(`agentscan v${version} — ${safe(name)}`),
  );
  if (args.resolvedFrom !== undefined) {
    // The scan silently targeting an ancestor is worse than it refusing to run.
    lines.push(
      `       no package.json in ${safe(args.resolvedFrom)} — scanned ${safe(facts.root)}`,
    );
  }
  lines.push("");
  lines.push(ink.dim(`Scanned: ${formatStack(facts)}`));
  lines.push("");

  for (const group of groupByRule(visible)) {
    lines.push(...formatGroup(group, facts.root, ink));
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
function formatHeaderBox(
  findings: Finding[],
  verbose: boolean,
  name: string,
  ink: Paint,
): string[] {
  const points = score(findings);
  const tone: Tone = scoreTone(points);
  const [eyes, mouth] = scoreFace(points);
  const filled = Math.round((points / 100) * BAR_CELLS);
  const bar =
    ink.tone(tone, "█".repeat(filled)) + ink.dim("░".repeat(BAR_CELLS - filled));

  const verdict = `${ink.strong(tone, `${points}/100`)}  ${ink.tone(tone, scoreLabel(points))}${ink.dim(`  ·  ${name}`)}`;

  return [
    `  ${ink.tone(tone, "┌─────┐")}   ${verdict}`,
    `  ${ink.tone(tone, `│ ${eyes} │`)}   ${bar}`,
    `  ${ink.tone(tone, `│ ${mouth} │`)}   ${ink.dim(countsLine(findings, verbose))}`,
    `  ${ink.tone(tone, "└─────┘")}`,
    "",
  ];
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

const ACTION_TONE: Partial<Record<Action, Tone>> = {
  delete: "red",
  warn: "yellow",
  drift: "yellow",
  add: "green",
  refresh: "green",
};

function formatGroup(group: Finding[], root: string, ink: Paint): string[] {
  const first = group[0] as Finding;
  const count = group.length;
  const out: string[] = [];

  const tone = ACTION_TONE[first.action];
  const label = actionColumn(first.action);
  out.push(
    `${tone === undefined ? ink.dim(label) : ink.tone(tone, label)} ${ink.dim(`rule:${safe(first.ruleId)}`)}${count > 1 ? ink.bold(`  ×${count}`) : ""}`,
  );
  // With one occurrence the message names its own subject; repeated, the
  // per-subject lines below carry that and the shared sentence goes up top.
  out.push(`        ${safe(count === 1 ? first.message : ruleHeadline(first))}`);

  for (const f of group) {
    const where = f.evidence
      .filter((e) => e.kind !== "count" && e.kind !== "threshold")
      .map((e) => shortPath(e.value, root));
    const location = where.length > 0 ? where.join(" · ") : f.subject;
    out.push(ink.dim(`          ${safe(shortPath(location, root))}`));
  }
  return out;
}

/**
 * The message with its trailing subject stripped, so the group header reads as
 * a statement about the rule rather than about whichever finding came first.
 */
function ruleHeadline(f: Finding): string {
  const cut = f.message.indexOf(": ");
  return cut === -1 ? f.message : f.message.slice(0, cut);
}

/** `6 warn · 4 info hidden`, without the score — the header shows that above. */
function countsLine(findings: Finding[], verbose: boolean): string {
  const parts = actionParts(findings, verbose);
  return parts.length === 0 ? "no findings" : parts.join(" · ");
}

/**
 * `6 warn · 4 info hidden` as parts, shared by the header box and the summary
 * so the two can never report different counts for the same scan.
 */
function actionParts(findings: Finding[], verbose: boolean): string[] {
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
  return parts;
}

function formatSummary(
  findings: Finding[],
  verbose: boolean,
  ink: Paint,
): string {
  const parts = actionParts(findings, verbose);
  const points = score(findings);
  const scored = `score ${ink.tone(scoreTone(points), `${points}/100 ${scoreLabel(points)}`)}`;
  if (parts.length === 0) {
    return `Summary: no findings · ${scored}`;
  }

  return `Summary: ${parts.join(" · ")} · ${scored}`;
}
