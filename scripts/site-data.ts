#!/usr/bin/env bun
/**
 * Generate the site's data from the repo, so no count or release is hand-copied.
 *
 *   bun run site:data   # writes site/data/checks.json, releases.json and product.json
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
export const PRODUCT_PATH = join(ROOT, "site/data/product.json");
export const PACKAGE_PATH = join(ROOT, "package.json");

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

/** The site cannot import ../package.json (turbopack root is site/), so the version is copied here. */
export function buildProduct(packageJson: string): { version: string } {
  return { version: (JSON.parse(packageJson) as { version: string }).version };
}

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
  let sawUnreleased = false;
  for (const line of changelog.split("\n")) {
    if (line.startsWith("## ")) {
      finish();
      current = undefined;
      if (releases.at(-1)?.version === LAST_VERSION) return releases;
      if (line.trim() === "## Unreleased") {
        sawUnreleased = true;
        continue;
      }
      const match = HEADING.exec(line);
      if (match?.[1] && match[2]) current = { version: match[1], date: match[2], lines: [] };
      else if (sawUnreleased) {
        throw new Error(`CHANGELOG.md: "${line}" does not match "## X.Y.Z — YYYY-MM-DD"`);
      }
      continue;
    }
    current?.lines.push(line);
  }
  finish();
  return releases;
}

function parseSection(version: string, date: string, lines: string[]): SiteRelease {
  // Summary: the first paragraph before any bullet.
  const summaryLines: string[] = [];
  let i = 0;
  while (i < lines.length && (lines[i] ?? "").trim() === "") i++;
  const isBreak = (line: string) => line.trim() === "" || line.startsWith("- ") || line.startsWith("#");
  while (i < lines.length && !isBreak(lines[i] ?? "")) {
    summaryLines.push(lines[i] ?? "");
    i++;
  }
  const items: string[] = [];
  let item: string[] | undefined;
  let nested = false;
  let label = "";
  const push = (parts: string[]) => {
    const text = clean(parts.join(" "));
    if (!namesOnlyTestFiles(text)) items.push(label + text);
  };
  for (const line of lines.slice(i)) {
    if (line.startsWith("### ")) {
      if (item) push(item);
      item = undefined;
      label = `${line.slice(4).trim()}: `;
    } else if (line.startsWith("- ")) {
      if (item) push(item);
      item = [line.slice(2)];
      nested = false;
    } else if (item && /^ {2}- /.test(line)) {
      nested = true; // top-level bullets only
    } else if (item && !nested && /^ {2}\S/.test(line)) {
      item.push(line);
    } else if (item && line.trim() !== "" && !line.startsWith(" ")) {
      push(item);
      item = undefined;
    }
  }
  if (item) push(item);
  let summary = clean(summaryLines.join(" "));
  // A section with bullets only (2.3.1): its first bullet stands in as the summary.
  if (summary === "" && items.length > 0) summary = items.shift() ?? "";
  return { version, date, summary, items, breaking: /breaking/i.test(summary) };
}

/** A bullet whose only paths are under tests/ is about the test suite, not the product. */
function namesOnlyTestFiles(text: string): boolean {
  const paths = [...text.matchAll(/`([^`]*\/[^`]*)`/g)].map((m) => m[1] ?? "");
  return paths.length > 0 && paths.every((path) => path.startsWith("tests/"));
}

export function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

if (import.meta.main) {
  const checks = buildChecks();
  const releases = buildReleases(readFileSync(CHANGELOG_PATH, "utf8"));
  writeFileSync(CHECKS_PATH, serialize(checks), "utf8");
  writeFileSync(RELEASES_PATH, serialize(releases), "utf8");
  writeFileSync(PRODUCT_PATH, serialize(buildProduct(readFileSync(PACKAGE_PATH, "utf8"))), "utf8");
  process.stdout.write(
    `wrote ${checks.length} checks and ${releases.length} releases (${releases.map((r) => r.version).join(", ")})\n`,
  );
}
