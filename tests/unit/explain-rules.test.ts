// tests/unit/explain-rules.test.ts
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { runExplain } from "../../src/commands/explain";
import { runRulesCommand } from "../../src/commands/rules";

const fixturesRoot = join(import.meta.dir, "../fixtures");

describe("runExplain", () => {
  test("prints details for a known finding id", async () => {
    const dir = join(fixturesRoot, "lock-drift");
    const findingId = "skill.not-in-lock:skill:local-only";

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
  test("lists budget checks with id and description", async () => {
    const dir = join(fixturesRoot, "clean-repo");
    const result = await runRulesCommand({ dir });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("claude.agent.invalid-name");
    expect(result.stdout).toContain("budget.mcp");
    // orphans are computed from facts, not shipped as a rule
    expect(result.stdout).not.toContain("skill.orphan");
    // descriptions should appear on the same lines
    expect(result.stdout).toMatch(/budget\.mcp\s+.+/);
  });

  test("lists the structural checks that actually find things", async () => {
    const dir = join(fixturesRoot, "clean-repo");
    const result = await runRulesCommand({ dir });

    // the checks that actually find things must not be invisible here
    for (const id of [
      "claude.hook.missing-script",
      "claude.hook.unknown-event",
      "security.hardcoded-secret",
      "mcp.command-missing",
      "claude.skill.missing-description",
      "skill.not-in-lock",
      "config.unreadable",
    ]) {
      expect(result.stdout).toContain(id);
    }
    expect(result.stdout).toMatch(/claude\.hook\.missing-script\s+.+/);
  });

  test("explain names the provenance, the full URL, and the capture", async () => {
    const dir = join(fixturesRoot, "lock-drift");
    const result = await runExplain(
      "skill.locked-not-installed:skill:pinned-but-gone",
      { dir },
    );

    expect(result.stdout).toContain("provenance: internal-consistency");
    // derived rules print no URL, and say why rather than going quiet
    expect(result.stdout).toContain("no vendor page");
    expect(result.stdout).not.toContain("capture: ");
  });

  test("rules --json carries the source for every rule", async () => {
    const dir = join(fixturesRoot, "clean-repo");
    const result = await runRulesCommand({ dir, json: true });
    const parsed = JSON.parse(result.stdout) as {
      id: string;
      provenance: string;
      source: { kind: string; url?: string; capture?: string };
    }[];

    expect(parsed.length).toBeGreaterThan(100);
    const cursorEvent = parsed.find((r) => r.id === "cursor.hook.unknown-event");
    expect(cursorEvent?.provenance).toBe("spec-required");
    expect(cursorEvent?.source.url).toBe("https://cursor.com/docs/hooks");
    expect(cursorEvent?.source.capture).toBe("cursor-hooks.md");
    // every rule, not just the ones with a page
    expect(parsed.every((r) => r.source.kind === "spec" || r.source.kind === "derived")).toBe(true);
  });

  test("the plain listing shows provenance and source next to the id", async () => {
    const dir = join(fixturesRoot, "clean-repo");
    const result = await runRulesCommand({ dir });

    expect(result.stdout).toMatch(/cursor\.hook\.unknown-event\s+spec-required\s+cursor\.com\/docs\/hooks/);
    expect(result.stdout).toMatch(/mcp\.command-missing\s+internal-consistency\s+\(cross-provider/);
  });
});
