// tests/unit/explain-rules.test.ts
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { runExplain } from "../../src/commands/explain";
import { runRulesCommand } from "../../src/commands/rules";

const fixturesRoot = join(import.meta.dir, "../fixtures");

describe("runExplain", () => {
  test("prints details for a known finding id", async () => {
    const dir = join(fixturesRoot, "next16-redundant-skill");
    const findingId =
      "next.redundant-cache-components-skill:skill:next-cache-components";

    const result = await runExplain(findingId, { dir });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`id: ${findingId}`);
    expect(result.stdout).toContain("message:");
    expect(result.stdout).toContain("reason:");
    expect(result.stdout).toContain("evidence:");
  });

  test("explains a structural check finding, not just rule findings", async () => {
    const dir = join(fixturesRoot, "lock-drift");
    const result = await runExplain(
      "skill.locked-not-installed:skill:pinned-but-gone",
      { dir },
    );

    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("rule: skill.locked-not-installed");
    expect(result.stdout).toContain("reason:");
    expect(result.stdout).toContain("suggest:");
  });

  test("exits 1 when finding id is missing", async () => {
    const dir = join(fixturesRoot, "clean-repo");
    const result = await runExplain("no.such:finding", { dir });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Finding not found");
    expect(result.stderr).toContain("no.such:finding");
  });
});

describe("runRulesCommand", () => {
  test("lists builtin rules with id and description", async () => {
    const dir = join(fixturesRoot, "clean-repo");
    const result = await runRulesCommand({ dir });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("next.redundant-cache-components-skill");
    expect(result.stdout).toContain("better-auth.missing-skill");
    expect(result.stdout).toContain("budget.skills");
    // orphans are computed from facts, not shipped as a rule
    expect(result.stdout).not.toContain("skill.orphan");
    // descriptions should appear on the same lines
    expect(result.stdout).toMatch(
      /next\.redundant-cache-components-skill\s+.+/,
    );
  });

  test("lists structural checks alongside YAML rules", async () => {
    const dir = join(fixturesRoot, "clean-repo");
    const result = await runRulesCommand({ dir });

    // the checks that actually find things must not be invisible here
    for (const id of [
      "hook.missing-script",
      "hook.unknown-event",
      "mcp.hardcoded-secret",
      "skill.name-mismatch",
      "skill.not-in-lock",
      "config.unreadable",
    ]) {
      expect(result.stdout).toContain(id);
    }
    expect(result.stdout).toMatch(/hook\.missing-script\s+.+/);
  });
});
