#!/usr/bin/env bun
/**
 * Compare the values agentscan hardcodes against the specs they came from.
 *
 * Run at release time, never from `check` — the scan path makes no network
 * calls and that guarantee is worth more than automatic freshness.
 *
 *   bun run spec:check
 *
 * This is a drift detector for a human to read, not an oracle. It over-reports
 * on purpose: a name it flags may be a false alarm from the page's prose, and
 * deciding that is the reviewer's job. What it must never do is stay quiet
 * while the hardcoded set is wrong — that already happened, with nine of
 * thirty-one hook events, and it reported a working hook as dead.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { COMMANDCODE_HOOK_EVENTS, KNOWN_HOOK_EVENTS, VSCODE_HOOK_EVENTS } from "../src/checks/index";
import { SPEC_SURFACES, surfaceStalenessNotes } from "./spec-surfaces";

const SPEC_DIR = join(import.meta.dir, "../docs/spec");
/** Re-read the sources when the newest capture is older than this. */
const STALE_AFTER_DAYS = 90;

/**
 * PascalCase names on the hooks page that have been reviewed and are not hook
 * events. Recording the verdict keeps a known false alarm from costing a second
 * review — the same discipline as the rejected-findings list in plans/README.md.
 * Add a name here only after checking the page, with the reason.
 */
const REVIEWED_NOT_EVENTS = new Set([
  // A tool name. The event that fires when it is called is `TaskCreated`.
  "TaskCreate",
  // A tool name mentioned on TaskCompleted; the event is still `TaskCompleted`.
  "TaskUpdate",
]);

type Report = { drift: string[]; notes: string[] };

async function page(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) {
      return null;
    }
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Names the hooks page presents as events, minus the ones we already know.
 *
 * The page is prose plus tables, so this cannot be exact: it collects
 * PascalCase tokens that appear in backticks or table cells and filters to
 * plausible event shapes. Expect a few non-events in the output.
 */
function candidateEvents(html: string): Set<string> {
  const out = new Set<string>();
  for (const m of html.matchAll(/\b([A-Z][a-z]+(?:[A-Z][a-z]+){1,3})\b/g)) {
    const name = m[1];
    if (name !== undefined) {
      out.add(name);
    }
  }
  return out;
}

async function checkHookEvents(report: Report): Promise<void> {
  const url = "https://code.claude.com/docs/en/hooks";
  const html = await page(url);
  if (html === null) {
    report.notes.push(`could not fetch ${url} — hook events unverified`);
    return;
  }

  const missingFromPage = [...KNOWN_HOOK_EVENTS].filter(
    (e) => !html.includes(e),
  );
  if (missingFromPage.length > 0) {
    report.drift.push(
      `hook events we claim but the page does not mention: ${missingFromPage.join(", ")}`,
    );
  }

  // Only flag candidates the page ties to hooks, to keep the noise survivable.
  const candidates = [...candidateEvents(html)].filter(
    (name) =>
      !KNOWN_HOOK_EVENTS.has(name) &&
      !REVIEWED_NOT_EVENTS.has(name) &&
      new RegExp(`\`${name}\`|\\| *${name} *\\|`).test(html) &&
      /^(?:Pre|Post|Session|Subagent|Task|User|Permission|Tool|Stop|Notification|Config|Cwd|Directory|File|Worktree|Elicitation|Message|Instructions|Teammate|Setup)/.test(
        name,
      ),
  );
  if (candidates.length > 0) {
    report.drift.push(
      `possible new hook events on the page: ${candidates.sort().join(", ")}`,
    );
  }
}

function checkCaptureDates(report: Report): void {
  const today = Date.now();
  let newest = 0;
  for (const file of readdirSync(SPEC_DIR)) {
    if (!file.endsWith(".md")) {
      continue;
    }
    const text = readFileSync(join(SPEC_DIR, file), "utf8");
    const match = text.match(/\*\*Read:\*\*\s*(\d{4}-\d{2}-\d{2})/);
    if (match?.[1] === undefined) {
      if (file !== "README.md") {
        report.drift.push(`docs/spec/${file} has no "**Read:**" date`);
      }
      continue;
    }
    newest = Math.max(newest, Date.parse(match[1]));
  }
  if (newest === 0) {
    return;
  }
  const days = Math.floor((today - newest) / 86_400_000);
  if (days > STALE_AFTER_DAYS) {
    report.drift.push(
      `newest docs/spec capture is ${days} days old (over ${STALE_AFTER_DAYS}) — re-read the sources`,
    );
  } else {
    report.notes.push(`newest docs/spec capture is ${days} days old`);
  }
}

function checkSurfaceStaleness(report: Report): void {
  for (const note of surfaceStalenessNotes()) {
    report.drift.push(note);
  }
  report.notes.push(`tracking ${SPEC_SURFACES.length} captured spec surfaces`);
}

async function checkVscodeHookEvents(report: Report): Promise<void> {
  const url = "https://code.visualstudio.com/docs/agent-customization/hooks";
  const html = await page(url);
  if (html === null) {
    report.notes.push(`could not fetch ${url} — VS Code hook events unverified`);
    return;
  }
  const missingFromPage = [...VSCODE_HOOK_EVENTS].filter((e) => !html.includes(e));
  if (missingFromPage.length > 0) {
    report.drift.push(
      `VS Code hook events we claim but the page does not mention: ${missingFromPage.join(", ")}`,
    );
  }
}

async function checkCommandcodeHookEvents(report: Report): Promise<void> {
  const url = "https://commandcode.ai/docs/hooks";
  const html = await page(url);
  if (html === null) {
    report.notes.push(`could not fetch ${url} — Command Code hook events unverified`);
    return;
  }
  const missingFromPage = [...COMMANDCODE_HOOK_EVENTS].filter((e) => !html.includes(e));
  if (missingFromPage.length > 0) {
    report.drift.push(
      `Command Code hook events we claim but the page does not mention: ${missingFromPage.join(", ")}`,
    );
  }
}

const report: Report = { drift: [], notes: [] };
checkCaptureDates(report);
checkSurfaceStaleness(report);
await checkHookEvents(report);
await checkVscodeHookEvents(report);
await checkCommandcodeHookEvents(report);

for (const note of report.notes) {
  process.stdout.write(`note: ${note}\n`);
}
if (report.drift.length === 0) {
  process.stdout.write("no spec drift detected\n");
  process.exit(0);
}
for (const item of report.drift) {
  process.stdout.write(`DRIFT: ${item}\n`);
}
process.stdout.write(
  "\nReview each line against the source, update src/ and docs/spec/ together,\nand bump the **Read:** date. Some entries are prose false alarms.\n",
);
process.exit(1);
