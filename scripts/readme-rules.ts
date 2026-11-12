#!/usr/bin/env bun
/**
 * Keep the README rule table in step with `STRUCTURAL_CHECKS`.
 *
 *   bun run readme:rules          # rewrite the table
 *   bun run readme:rules --check  # exit 1 if it is out of date
 *
 * The registry is the source of truth for id, severity, provenance, source,
 * and the Catches sentence (`check.description`). Hand-written README prose
 * is not kept.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { STRUCTURAL_CHECKS } from "../src/checks/index";
import type { StructuralCheck } from "../src/checks/provenance";
import { severityLabel } from "../src/checks/provenance";
import { shortSourceUrl } from "../src/report/provenance-line";

const README = join(import.meta.dir, "../README.md");
const START = "<!-- rules:start -->";
const END = "<!-- rules:end -->";
const CHECK = process.argv.includes("--check");

function sourceCell(check: StructuralCheck): string {
  if (check.source.kind === "spec") {
    return `[${shortSourceUrl(check.source.url)}](${check.source.url})`;
  }
  return `_${check.source.detail}_`;
}

function render(): string {
  const rows = [
    "| id | Severity | Provenance | Source | Catches |",
    "|----|----------|------------|--------|---------|",
  ];
  for (const check of STRUCTURAL_CHECKS) {
    rows.push(
      `| \`${check.id}\` | ${severityLabel(check)} | ${check.provenance} | ${sourceCell(check)} | ${check.description} |`,
    );
  }
  return rows.join("\n");
}

const text = readFileSync(README, "utf8");
const from = text.indexOf(START);
const to = text.indexOf(END);
if (from === -1 || to === -1 || to < from) {
  process.stderr.write(`${README} has no ${START} / ${END} markers\n`);
  process.exit(2);
}

const table = render();
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
