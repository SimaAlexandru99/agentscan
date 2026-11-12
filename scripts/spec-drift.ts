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
 * while the hardcoded set is wrong, which would report a working hook as dead.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SPEC_PAGES } from "../src/checks/spec-pages";
import { HOOK_PROFILES, type HookSchemaProfile } from "../src/facts/hook-profiles";
import { VSCODE_HOOK_EVENTS } from "../src/facts/hook-schema";
import {
  fetchUrlFor,
  missingBaselineUrls,
  normalizeSpecText,
  MS_PER_DAY,
  SPEC_HASHES_PATH,
  SPEC_SURFACES,
  specContentHash,
  STALE_AFTER_DAYS,
  surfacesForUrl,
  surfaceStalenessNotes,
  SUSPICIOUSLY_SHORT_PAGE_CHARS,
  uniqueSurfaceUrls,
  type SpecHashBaseline,
} from "./spec-surfaces";

const SPEC_DIR = join(import.meta.dir, "../docs/spec");
/**
 * `bun run spec:record` — rewrite scripts/spec-hashes.json from the live pages.
 * Only for a human who has just re-read every page whose hash moved and updated
 * the capture; recording without reading turns the detector back into silence.
 */
const RECORD = process.argv.includes("--record");

/**
 * PascalCase names on the hooks page that have been reviewed and are not hook
 * events. Add a name here only after checking the page, with the reason.
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
  const days = Math.floor((today - newest) / MS_PER_DAY);
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

/**
 * Only a missing file means "no baseline". A corrupt one must stop the run:
 * treating it as empty would let `--record` overwrite it in silence.
 */
function readBaseline(): SpecHashBaseline {
  let raw: string;
  try {
    raw = readFileSync(SPEC_HASHES_PATH, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${SPEC_HASHES_PATH} is not valid JSON: ${(error as Error).message}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${SPEC_HASHES_PATH} is not a JSON object`);
  }
  return parsed as SpecHashBaseline;
}

function surfaceLabel(url: string): string {
  const owners = surfacesForUrl(url).map((surface) => `${surface.provider} ${surface.surface}`);
  return owners.length > 0 ? owners.join(" + ") : url;
}

/**
 * Compare every unique source page against its recorded content hash.
 *
 * The hook-event check covers only the hooks pages and the staleness check only
 * looks at dates, so a vendor adding an alias, a field, or a spelling to any
 * other page would otherwise move nothing. A changed hash does not say what changed — it says "open this URL and re-read
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
    const previous = baseline[url];
    const html = await page(fetchUrlFor(url));
    const text = html === null ? null : normalizeSpecText(html);
    if (text === null || text.length < SUSPICIOUSLY_SHORT_PAGE_CHARS) {
      if (text === null) {
        report.notes.push(`could not fetch ${url} — content hash unverified (${surfaceLabel(url)})`);
      } else {
        // An error shell or redirect stub, not documentation.
        report.drift.push(
          `${surfaceLabel(url)} normalised to only ${text.length} characters — fetch or selector problem, not compared — ${url}`,
        );
      }
      // Keep the previous hash so a bad fetch is never recorded as the page's content.
      unhashed.push(url);
      if (previous !== undefined) {
        next[url] = previous;
      }
      continue;
    }
    const hash = specContentHash(text);
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

/**
 * Gemini's names are ordinary English words in PascalCase (`Notification`,
 * `SessionStart`), so a substring hit on the whole page would pass on prose
 * alone. Match the backticked or table-cell spellings the event table uses.
 */
/** Identifier spelling in markdown backticks, markdown tables, or HTML `<code>`. */
function pageMentionsEvent(html: string, event: string): boolean {
  return (
    html.includes("`" + event + "`") ||
    new RegExp(`\\| *${event} *\\|`).test(html) ||
    new RegExp(`<code[^>]*>${event}</code>`).test(html)
  );
}

type HookEventPage = {
  label: string;
  url: string;
  mentions?: (page: string, event: string) => boolean;
  /** Events checked on another provider's page instead. */
  skip?: ReadonlySet<string>;
  /** Also report PascalCase names the page ties to hooks that we do not know. */
  scanCandidates?: true;
};

/**
 * The page each hook profile's events (`HOOK_PROFILES[p].events`) are checked
 * against. `null`: that profile's events are not checked against a page.
 */
const HOOK_EVENT_PAGES: Record<HookSchemaProfile, HookEventPage | null> = {
  claude: { label: "Claude", url: SPEC_PAGES.claudeHooks.url, scanCandidates: true },
  // The customization guide now documents the Copilot harness. The eight
  // PascalCase names live on the legacy Local reference.
  "vscode-native": { label: "VS Code", url: SPEC_PAGES.vscodeHooks.url },
  // Copilot CLI also accepts the VS Code names; those are checked on the VS Code page.
  "copilot-cli": { label: "Copilot CLI", url: SPEC_PAGES.copilotHooks.url, skip: VSCODE_HOOK_EVENTS },
  commandcode: { label: "Command Code", url: SPEC_PAGES.commandcodeHooks.url },
  grok: { label: "Grok", url: SPEC_PAGES.grokHooks.url },
  gemini: { label: "Gemini", url: fetchUrlFor(SPEC_PAGES.geminiHooks.url), mentions: pageMentionsEvent },
  cursor: { label: "Cursor", url: SPEC_PAGES.cursorHooks.url },
  // SessionEnd, PreCompact, and PostCompact are quoted on
  // https://kiro.dev/docs/hooks/types/ (2026-11-12), not on the IDE 1.0 table.
  kiro: {
    label: "Kiro",
    url: SPEC_PAGES.kiroHooksV1.url,
    mentions: pageMentionsEvent,
    skip: new Set(["SessionEnd", "PreCompact", "PostCompact"]),
  },
  windsurf: null,
  devin: { label: "Devin", url: SPEC_PAGES.devinHooks.url },
};

/** Names the page ties to hooks, minus the ones we know; filtered to keep the noise survivable. */
function newEventCandidates(html: string, known: ReadonlySet<string>): string[] {
  return [...candidateEvents(html)].filter(
    (name) =>
      !known.has(name) &&
      !REVIEWED_NOT_EVENTS.has(name) &&
      new RegExp(`\`${name}\`|\\| *${name} *\\|`).test(html) &&
      /^(?:Pre|Post|Session|Subagent|Task|User|Permission|Tool|Stop|Notification|Config|Cwd|Directory|File|Worktree|Elicitation|Message|Instructions|Teammate|Setup)/.test(
        name,
      ),
  );
}

async function checkHookEvents(report: Report): Promise<void> {
  for (const [profile, target] of Object.entries(HOOK_EVENT_PAGES) as [HookSchemaProfile, HookEventPage | null][]) {
    if (target === null) {
      continue;
    }
    const { label, url, mentions, skip, scanCandidates } = target;
    const html = await page(url);
    if (html === null) {
      report.notes.push(`could not fetch ${url} — ${label} hook events unverified`);
      continue;
    }
    const known = HOOK_PROFILES[profile].events;
    const missingFromPage = [...known].filter(
      (e) => skip?.has(e) !== true && (mentions === undefined ? !html.includes(e) : !mentions(html, e)),
    );
    if (missingFromPage.length > 0) {
      report.drift.push(
        `${label} hook events we claim but the page does not mention: ${missingFromPage.join(", ")}`,
      );
    }
    const candidates = scanCandidates === true ? newEventCandidates(html, known) : [];
    if (candidates.length > 0) {
      report.drift.push(`possible new hook events on the page: ${candidates.sort().join(", ")}`);
    }
  }
}

const report: Report = { drift: [], notes: [] };
checkCaptureDates(report);
checkSurfaceStaleness(report);
await checkHookEvents(report);
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
