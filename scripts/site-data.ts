#!/usr/bin/env bun
/**
 * Generate the site's data from the repo, so no count or release is hand-copied.
 *
 *   bun run site:data   # writes site/data/checks.json and site/data/releases.json
 *
 * `tests/unit/site-data.test.ts` regenerates both in memory and fails when the
 * committed JSON is stale.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { STRUCTURAL_CHECKS } from "../src/checks/index";
import { severityLabel } from "../src/checks/provenance";

const ROOT = join(import.meta.dir, "..");
export const CHECKS_PATH = join(ROOT, "site/data/checks.json");
export const RELEASES_PATH = join(ROOT, "site/data/releases.json");
export const CHANGELOG_PATH = join(ROOT, "CHANGELOG.md");

export type SiteCheck = {
  id: string;
  severity: string;
  provenance: string;
  description: string;
  sourceUrl: string | null;
  capture: string | null;
  lastVerified: string;
};

export type SiteRelease = {
  version: string;
  date: string;
  summary: string;
  items: string[];
  breaking: boolean;
};

export function buildChecks(): SiteCheck[] {
  return STRUCTURAL_CHECKS.map((check) => ({
    id: check.id,
    severity: severityLabel(check),
    provenance: check.provenance,
    description: check.description,
    sourceUrl: check.source.kind === "spec" ? check.source.url : null,
    capture: check.source.kind === "spec" ? check.source.capture : null,
    lastVerified: check.lastVerified,
  })).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

const HEADING = /^## (\d+\.\d+\.\d+) — (\d{4}-\d{2}-\d{2})\s*$/;
const LAST_VERSION = "2.0.0";

/** `**bold**` is dropped to its text; inline code stays as written. */
function clean(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\s+/g, " ").trim();
}

export function buildReleases(changelog: string): SiteRelease[] {
  const releases: SiteRelease[] = [];
  let current: { version: string; date: string; lines: string[] } | undefined;
  const finish = () => {
    if (current) releases.push(parseSection(current.version, current.date, current.lines));
  };
  for (const line of changelog.split("\n")) {
    if (line.startsWith("## ")) {
      finish();
      current = undefined;
      if (releases.at(-1)?.version === LAST_VERSION) return releases;
      const match = HEADING.exec(line);
      if (match?.[1] && match[2]) current = { version: match[1], date: match[2], lines: [] };
      continue;
    }
    current?.lines.push(line);
  }
  finish();
  return releases;
}

function parseSection(version: string, date: string, lines: string[]): SiteRelease {
  // Summary: the first paragraph before any bullet; empty when the section opens with bullets.
  const summaryLines: string[] = [];
  let i = 0;
  while (i < lines.length && (lines[i] ?? "").trim() === "") i++;
  while (i < lines.length && (lines[i] ?? "").trim() !== "" && !(lines[i] ?? "").startsWith("- ")) {
    summaryLines.push(lines[i] ?? "");
    i++;
  }
  const items: string[] = [];
  let item: string[] | undefined;
  let nested = false;
  for (const line of lines.slice(i)) {
    if (line.startsWith("- ")) {
      if (item) items.push(clean(item.join(" ")));
      item = [line.slice(2)];
      nested = false;
    } else if (item && /^ {2}- /.test(line)) {
      nested = true; // top-level bullets only
    } else if (item && !nested && /^ {2}\S/.test(line)) {
      item.push(line);
    } else if (item && line.trim() !== "" && !line.startsWith(" ")) {
      items.push(clean(item.join(" ")));
      item = undefined;
    }
  }
  if (item) items.push(clean(item.join(" ")));
  const summary = clean(summaryLines.join(" "));
  return { version, date, summary, items, breaking: /breaking/i.test(summary) };
}

export function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

if (import.meta.main) {
  const checks = buildChecks();
  const releases = buildReleases(readFileSync(CHANGELOG_PATH, "utf8"));
  writeFileSync(CHECKS_PATH, serialize(checks), "utf8");
  writeFileSync(RELEASES_PATH, serialize(releases), "utf8");
  process.stdout.write(
    `wrote ${checks.length} checks and ${releases.length} releases (${releases.map((r) => r.version).join(", ")})\n`,
  );
}
