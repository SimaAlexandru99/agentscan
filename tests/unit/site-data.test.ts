import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  buildChecks,
  buildReleases,
  CHANGELOG_PATH,
  CHECKS_PATH,
  RELEASES_PATH,
  serialize,
} from "../../scripts/site-data";

describe("site data matches the registry and CHANGELOG — run `bun run site:data`", () => {
  test("site/data/checks.json", () => {
    expect(readFileSync(CHECKS_PATH, "utf8")).toBe(serialize(buildChecks()));
  });

  test("site/data/releases.json", () => {
    expect(readFileSync(RELEASES_PATH, "utf8")).toBe(
      serialize(buildReleases(readFileSync(CHANGELOG_PATH, "utf8"))),
    );
  });

  test("releases parse summary (first bullet when no paragraph), top-level bullets, and the breaking flag", () => {
    const releases = buildReleases(
      [
        "## Unreleased",
        "",
        "## 2.1.0 — 2026-11-14",
        "",
        "- `a` first",
        "  wraps",
        "- second",
        "",
        "## 2.0.0 — 2026-11-12",
        "",
        "Breaking for **old** configs.",
        "",
        "- top",
        "  - nested",
        "    more",
        "- next",
        "",
        "## 1.4.0 — 2026-09-02",
        "- never read",
      ].join("\n"),
    );
    expect(releases).toEqual([
      { version: "2.1.0", date: "2026-11-14", summary: "`a` first wraps", items: ["second"], breaking: false },
      { version: "2.0.0", date: "2026-11-12", summary: "Breaking for old configs.", items: ["top", "next"], breaking: true },
    ]);
  });
});
