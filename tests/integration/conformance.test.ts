import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { analyze } from "../../src/analyze";

const fixturesRoot = join(import.meta.dir, "../fixtures/conformance");

const fixtures = readdirSync(fixturesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

type FactCounts = {
  hooks?: number;
  mcp?: number;
  skills?: number;
  agents?: number;
  rules?: number;
};

/**
 * What discovery must see in each fixture. Zero findings on a fixture that
 * discovery silently skipped would prove nothing, so every fixture pins the
 * number of facts its official examples produce. Raise a number when you add
 * an example; a drop is a discovery regression, not a fixture problem.
 */
const MINIMUM_FACTS: Record<string, FactCounts> = {
  "agent-skills": { skills: 2 },
  "antigravity-json": { mcp: 2 },
  "claude-json": { hooks: 5, mcp: 3 },
  "codex-toml": { mcp: 2 },
  commandcode: { hooks: 4, mcp: 3, skills: 2, agents: 2 },
  "continue-mcpservers": { mcp: 1 },
  "continue-yaml": { mcp: 2 },
  "copilot-hooks": { hooks: 9 },
  "cursor-json": { hooks: 15, mcp: 2 },
  "gemini-json": { hooks: 4, mcp: 4 },
  "grok-toml": { hooks: 2, mcp: 2, skills: 1, rules: 1 },
  "opencode-json": { mcp: 2 },
  "vscode-hooks": { hooks: 5 },
  "vscode-json": { mcp: 2 },
  "windsurf-rules": { rules: 1 },
};

describe("official-shaped conformance fixtures", () => {
  test("at least four fixtures are present", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(4);
  });

  test("every fixture has a minimum-facts entry", () => {
    expect(Object.keys(MINIMUM_FACTS).sort()).toEqual(fixtures);
  });

  for (const name of fixtures) {
    test(`${name} produces no error or warning findings`, () => {
      const analysis = analyze({ dir: join(fixturesRoot, name) });
      const actionable = analysis.findings.filter(
        (finding) => finding.severity === "error" || finding.severity === "warning",
      );
      expect(actionable.map((finding) => finding.ruleId)).toEqual([]);
    });

    test(`${name} is actually seen by discovery`, () => {
      const facts = analyze({ dir: join(fixturesRoot, name) }).facts;
      const minimum = MINIMUM_FACTS[name] ?? {};
      const seen = {
        hooks: facts.hooks.length,
        mcp: facts.mcp.length,
        skills: facts.skills.length,
        agents: facts.agents.length,
        rules: (facts.rules ?? []).length,
      };
      for (const [kind, floor] of Object.entries(minimum) as [keyof FactCounts, number][]) {
        expect(seen[kind]).toBeGreaterThanOrEqual(floor);
      }
    });
  }
});
