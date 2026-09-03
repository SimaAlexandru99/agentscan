import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { STRUCTURAL_CHECKS } from "../../src/checks/index";

const ROOT = join(import.meta.dir, "../..");

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

/**
 * The check count is written by hand in four places outside the registry, and
 * one of them (`site/lib/site.ts`) was left at 103 while the other three were
 * updated to 112 by hand in the same change. Counting is not a job for people.
 */
describe("the documented check count matches the registry", () => {
  const total = STRUCTURAL_CHECKS.length;

  test("README badge, headline, and pipeline line", () => {
    const readme = read("README.md");
    expect(readme).toContain(`badge/checks-${total}-`);
    expect(readme).toContain(`<strong>${total} checks`);
    expect(readme).toContain(`3. Check       ${total} checks`);
  });

  test("the site never advertises more checks than exist", () => {
    // The site describes the published package, so it legitimately lags the
    // repo while checks sit in CHANGELOG `Unreleased`. Claiming *more* than
    // the registry holds is the direction that would be a lie.
    const match = /export const PRODUCT_CHECKS = (\d+);/.exec(read("site/lib/site.ts"));
    const advertised = Number(match?.[1]);
    expect(Number.isNaN(advertised)).toBe(false);
    expect(advertised).toBeLessThanOrEqual(total);
  });
});

/**
 * The rule table lost three `windsurf.hook.*` rows for a whole release because
 * nothing compared it to the registry. `bun run readme:rules` regenerates it;
 * this fails the build when someone forgets.
 */
describe("the README rule table matches the registry", () => {
  const readme = read("README.md");
  const from = readme.indexOf("<!-- rules:start -->");
  const to = readme.indexOf("<!-- rules:end -->");
  const block = readme.slice(from, to);
  const rows = [...block.matchAll(/^\| `([^`]+)` \| /gm)].map((m) => m[1]);

  test("markers are present", () => {
    expect(from).toBeGreaterThan(-1);
    expect(to).toBeGreaterThan(from);
  });

  test("every rule has a row, in registry order", () => {
    expect(rows).toEqual(STRUCTURAL_CHECKS.map((check) => check.id));
  });

  test("each row carries the registry's provenance and source", () => {
    const wrong: string[] = [];
    for (const check of STRUCTURAL_CHECKS) {
      const row = block
        .split("\n")
        .find((line) => line.startsWith(`| \`${check.id}\` |`));
      if (row === undefined) {
        continue;
      }
      if (!row.includes(`| ${check.provenance} |`)) {
        wrong.push(`${check.id}: provenance`);
      }
      const expected =
        check.source.kind === "spec" ? check.source.url : check.source.detail;
      if (!row.includes(expected)) {
        wrong.push(`${check.id}: source`);
      }
    }
    expect(wrong).toEqual([]);
  });
});
