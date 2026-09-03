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
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  COMMANDCODE_HOOK_EVENTS,
  CURSOR_HOOK_EVENTS,
  GEMINI_HOOK_EVENTS,
  GROK_HOOK_EVENTS,
  KNOWN_HOOK_EVENTS,
  VSCODE_HOOK_EVENTS,
} from "../src/checks/index";
import {
  COPILOT_ONLY_EVENTS,
  COPILOT_PASCAL_ALIASES,
  COPILOT_TO_VSCODE_EVENT,
} from "../src/facts/hook-schema";
import {
  fetchUrlFor,
  missingBaselineUrls,
  normalizeSpecText,
  SPEC_HASHES_PATH,
  SPEC_SURFACES,
  specContentHash,
  surfacesForUrl,
  surfaceStalenessNotes,
  SUSPICIOUSLY_SHORT_PAGE_CHARS,
  uniqueSurfaceUrls,
  type SpecHashBaseline,
} from "./spec-surfaces";

const SPEC_DIR = join(import.meta.dir, "../docs/spec");
/** Re-read the sources when the newest capture is older than this. */
const STALE_AFTER_DAYS = 90;
/**
 * `bun run spec:record` — rewrite scripts/spec-hashes.json from the live pages.
 * Only for a human who has just re-read every page whose hash moved and updated
 * the capture; recording without reading turns the detector back into silence.
 */
const RECORD = process.argv.includes("--record");

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

function readBaseline(): SpecHashBaseline {
  try {
    const parsed: unknown = JSON.parse(readFileSync(SPEC_HASHES_PATH, "utf8"));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as SpecHashBaseline;
  } catch {
    return {};
  }
}

function surfaceLabel(url: string): string {
  const owners = surfacesForUrl(url).map((surface) => `${surface.provider} ${surface.surface}`);
  return owners.length > 0 ? owners.join(" + ") : url;
}

/**
 * Compare every unique source page against its recorded content hash.
 *
 * This is what was missing on 2026-09-02: the hook-event diff above covers
 * five pages, and the staleness check only looks at dates, so a vendor adding
 * an alias, a field, or a spelling to any of the other pages moved nothing here.
 * A changed hash does not say what changed — it says "open this URL and re-read
 * the capture". That is the whole job.
 */
async function checkSurfaceContent(
  report: Report,
): Promise<{ baseline: SpecHashBaseline; unhashed: string[] }> {
  const baseline = readBaseline();
  const next: SpecHashBaseline = {};
  const unhashed: string[] = [];
  const today = new Date().toISOString().slice(0, 10);
  let compared = 0;
  for (const url of uniqueSurfaceUrls()) {
    const html = await page(fetchUrlFor(url));
    if (html === null) {
      report.notes.push(`could not fetch ${url} — content hash unverified (${surfaceLabel(url)})`);
      unhashed.push(url);
      const previous = baseline[url];
      if (previous !== undefined) {
        next[url] = previous;
      }
      continue;
    }
    const text = normalizeSpecText(html);
    if (text.length < SUSPICIOUSLY_SHORT_PAGE_CHARS) {
      // An error shell or redirect stub, not documentation. Keep the previous
      // hash so a bad fetch is never recorded as the page's content.
      report.drift.push(
        `${surfaceLabel(url)} normalised to only ${text.length} characters — fetch or selector problem, not compared — ${url}`,
      );
      unhashed.push(url);
      const previous = baseline[url];
      if (previous !== undefined) {
        next[url] = previous;
      }
      continue;
    }
    const hash = specContentHash(text);
    const previous = baseline[url];
    if (previous === undefined) {
      next[url] = { hash, recorded: today };
      if (!RECORD) {
        report.notes.push(`no content baseline for ${surfaceLabel(url)} — run bun run spec:record`);
      }
      continue;
    }
    compared += 1;
    if (previous.hash === hash) {
      next[url] = previous;
      continue;
    }
    next[url] = { hash, recorded: today };
    if (!RECORD) {
      report.drift.push(
        `${surfaceLabel(url)} page changed since ${previous.recorded} (${previous.hash} → ${hash}) — ${url}`,
      );
    }
  }
  report.notes.push(`compared ${compared} page content hashes against ${SPEC_HASHES_PATH}`);
  return { baseline: next, unhashed };
}

function writeBaseline(baseline: SpecHashBaseline): void {
  const sorted = Object.fromEntries(
    Object.entries(baseline).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
  writeFileSync(SPEC_HASHES_PATH, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
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

async function checkCopilotHookEvents(report: Report): Promise<void> {
  const url = "https://docs.github.com/en/copilot/reference/hooks-reference";
  const html = await page(url);
  if (html === null) {
    report.notes.push(`could not fetch ${url} — Copilot CLI hook events unverified`);
    return;
  }
  const claimed = [
    ...Object.keys(COPILOT_TO_VSCODE_EVENT),
    ...COPILOT_ONLY_EVENTS,
    ...Object.keys(COPILOT_PASCAL_ALIASES),
  ];
  const missingFromPage = claimed.filter((e) => !html.includes(e));
  if (missingFromPage.length > 0) {
    report.drift.push(
      `Copilot CLI hook events we claim but the page does not mention: ${missingFromPage.join(", ")}`,
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

async function checkGrokHookEvents(report: Report): Promise<void> {
  const url = "https://docs.x.ai/build/features/hooks";
  const html = await page(url);
  if (html === null) {
    report.notes.push(`could not fetch ${url} — Grok hook events unverified`);
    return;
  }
  const missingFromPage = [...GROK_HOOK_EVENTS].filter((e) => !html.includes(e));
  if (missingFromPage.length > 0) {
    report.drift.push(
      `Grok hook events we claim but the page does not mention: ${missingFromPage.join(", ")}`,
    );
  }
}

/**
 * Gemini's names are ordinary English words in PascalCase (`Notification`,
 * `SessionStart`), so a substring hit on the whole page would pass on prose
 * alone. Match the backticked or table-cell spellings the event table uses.
 */
async function checkGeminiHookEvents(report: Report): Promise<void> {
  const url = fetchUrlFor(
    "https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/index.md",
  );
  const text = await page(url);
  if (text === null) {
    report.notes.push(`could not fetch ${url} — Gemini hook events unverified`);
    return;
  }
  const missingFromPage = [...GEMINI_HOOK_EVENTS].filter(
    (e) => !new RegExp(`\`${e}\`|\\| *${e} *\\|`).test(text),
  );
  if (missingFromPage.length > 0) {
    report.drift.push(
      `Gemini hook events we claim but the page does not mention: ${missingFromPage.join(", ")}`,
    );
  }
}

async function checkCursorHookEvents(report: Report): Promise<void> {
  const url = "https://cursor.com/docs/hooks";
  const html = await page(url);
  if (html === null) {
    report.notes.push(`could not fetch ${url} — Cursor hook events unverified`);
    return;
  }
  const missingFromPage = [...CURSOR_HOOK_EVENTS].filter((e) => !html.includes(e));
  if (missingFromPage.length > 0) {
    report.drift.push(
      `Cursor hook events we claim but the page does not mention: ${missingFromPage.join(", ")}`,
    );
  }
}

const report: Report = { drift: [], notes: [] };
checkCaptureDates(report);
checkSurfaceStaleness(report);
await checkHookEvents(report);
await checkVscodeHookEvents(report);
await checkCopilotHookEvents(report);
await checkCommandcodeHookEvents(report);
await checkGrokHookEvents(report);
await checkGeminiHookEvents(report);
await checkCursorHookEvents(report);
const { baseline, unhashed } = await checkSurfaceContent(report);

if (RECORD) {
  // Recording means "these are the pages I re-read today". A page that could
  // not be fetched or hashed was not re-read, and a baseline with holes would
  // pass the next run in silence for exactly those pages. Write all or
  // nothing; the human retries.
  const notRecorded = [...new Set([...unhashed, ...missingBaselineUrls(baseline)])];
  if (notRecorded.length === 0) {
    writeBaseline(baseline);
    process.stdout.write(
      `recorded ${Object.keys(baseline).length} page content hashes to ${SPEC_HASHES_PATH}\n`,
    );
  } else {
    report.drift.push(
      `record aborted: ${notRecorded.length} page(s) could not be hashed, ${SPEC_HASHES_PATH} left unchanged — ${notRecorded.join(", ")}`,
    );
  }
}

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
  "\nReview each line against the source, update src/ and docs/spec/ together,\nand bump the **Read:** date. Some entries are prose false alarms.\nFor a changed page hash: re-read the page, update the capture and the\nconformance fixture, then run bun run spec:record.\n",
);
process.exit(1);
