#!/usr/bin/env bun
/**
 * Keep the README rule table in step with `STRUCTURAL_CHECKS`.
 *
 *   bun run readme:rules          # rewrite the table
 *   bun run readme:rules --check  # exit 1 if it is out of date
 *
 * Why a generator rather than a convention: the table had silently lost three
 * rules (`windsurf.hook.*`, PR #13) and nobody noticed for a release, because
 * nothing compared it to anything.
 *
 * Why it preserves cells instead of printing `check.description`: the README's
 * "Catches" prose is deliberately richer than the registry one-liner —
 * "Config file is not valid JSON or cannot be read" against "A config file that
 * is not valid JSON, so whatever it declares is silently not in effect". A
 * generator that overwrote it would trade a drift bug for a worse README. So
 * the README stays the source of truth for the prose and the severity, the
 * registry stays the source of truth for the id set, provenance, and source,
 * and this script enforces exactly that split.
 *
 * A rule with no row yet gets one seeded from the registry description, marked
 * for a human to improve.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { STRUCTURAL_CHECKS } from "../src/checks/index";
import type { StructuralCheck } from "../src/checks/provenance";

const README = join(import.meta.dir, "../README.md");
const START = "<!-- rules:start -->";
const END = "<!-- rules:end -->";
const CHECK = process.argv.includes("--check");

type Existing = { severity: string; catches: string };

/**
 * Parse the current table so hand-written severity and prose survive.
 *
 * Accepts the generated five-column shape and the hand-written three-column
 * one it replaced. Reading only the new shape would make the first run after a
 * format change silently duplicate columns instead of round-tripping — which
 * is exactly what happened while writing this.
 */
function existingRows(block: string): Map<string, Existing> {
  const out = new Map<string, Existing>();
  for (const line of block.split("\n")) {
    const trimmed = line.trim();
    const wide = /^\| `([^`]+)` \| ([^|]*?) \| [^|]*? \| .*? \| (.*?) \|$/.exec(trimmed);
    const narrow = /^\| `([^`]+)` \| ([^|]*?) \| (.*?) \|$/.exec(trimmed);
    const m = wide ?? narrow;
    const id = m?.[1];
    const severity = m?.[2];
    const catches = m?.[3];
    if (id !== undefined && severity !== undefined && catches !== undefined) {
      out.set(id, { severity: severity.trim(), catches: catches.trim() });
    }
  }
  return out;
}

function sourceCell(check: StructuralCheck): string {
  if (check.source.kind === "spec") {
    const label = check.source.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return `[${label}](${check.source.url})`;
  }
  return `_${check.source.detail}_`;
}

function render(existing: Map<string, Existing>): { table: string; seeded: string[] } {
  const seeded: string[] = [];
  const rows = [
    "| id | Severity | Provenance | Source | Catches |",
    "|----|----------|------------|--------|---------|",
  ];
  for (const check of STRUCTURAL_CHECKS) {
    const prior = existing.get(check.id);
    if (prior === undefined) {
      seeded.push(check.id);
    }
    const severity = prior?.severity ?? "error";
    const catches = prior?.catches ?? check.description;
    rows.push(
      `| \`${check.id}\` | ${severity} | ${check.provenance} | ${sourceCell(check)} | ${catches} |`,
    );
  }
  return { table: rows.join("\n"), seeded };
}

const text = readFileSync(README, "utf8");
const from = text.indexOf(START);
const to = text.indexOf(END);
if (from === -1 || to === -1 || to < from) {
  process.stderr.write(`${README} has no ${START} / ${END} markers\n`);
  process.exit(2);
}

const block = text.slice(from + START.length, to);
const { table, seeded } = render(existingRows(block));
const next = `${text.slice(0, from + START.length)}\n${table}\n${text.slice(to)}`;

if (CHECK) {
  if (next === text) {
    process.stdout.write(`README rule table matches ${STRUCTURAL_CHECKS.length} registry entries\n`);
    process.exit(0);
  }
  process.stderr.write("README rule table is out of date — run bun run readme:rules\n");
  process.exit(1);
}

writeFileSync(README, next, "utf8");
process.stdout.write(`wrote ${STRUCTURAL_CHECKS.length} rules to the README table\n`);
if (seeded.length > 0) {
  process.stdout.write(
    `seeded from the registry description, improve the prose by hand: ${seeded.join(", ")}\n`,
  );
}
