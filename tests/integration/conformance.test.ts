import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { analyze } from "../../src/analyze";

const fixturesRoot = join(import.meta.dir, "../fixtures/conformance");

const fixtures = readdirSync(fixturesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

describe("official-shaped conformance fixtures", () => {
  test("at least four fixtures are present", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(4);
  });

  for (const name of fixtures) {
    test(`${name} produces no error or warning findings`, () => {
      const analysis = analyze({ dir: join(fixturesRoot, name) });
      const actionable = analysis.findings.filter(
        (finding) => finding.severity === "error" || finding.severity === "warning",
      );
      expect(actionable.map((finding) => finding.ruleId)).toEqual([]);
    });
  }
});
