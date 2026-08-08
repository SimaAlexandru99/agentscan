import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { runCheck } from "../../src/commands/check";

const fixturesRoot = join(import.meta.dir, "../fixtures");

const ACTIONABLE = new Set([
  "delete",
  "add",
  "drift",
  "refresh",
  "warn",
]);

type FindingPayload = {
  action: string;
  subject: string;
  ruleId: string;
};

type JsonReport = {
  version: string;
  findings: FindingPayload[];
};

async function checkFixture(name: string): Promise<JsonReport> {
  const result = await runCheck({
    dir: join(fixturesRoot, name),
    json: true,
    failOn: "never",
  });

  expect(result.exitCode).toBe(0);

  return JSON.parse(result.stdout) as JsonReport;
}

function actionableFindings(findings: FindingPayload[]): FindingPayload[] {
  return findings.filter((f) => ACTIONABLE.has(f.action));
}

describe("runCheck integration", () => {
  test("next16 redundant skill → DELETE next.redundant-cache-components-skill", async () => {
    const payload = await checkFixture("next16-redundant-skill");


    const deleteFinding = payload.findings.find(
      (f) =>
        f.action === "delete" &&
        f.subject === "skill:next-cache-components" &&
        f.ruleId === "next.redundant-cache-components-skill",
    );
    expect(deleteFinding).toBeDefined();
  });

  test("better-auth missing → ADD better-auth.missing-skill", async () => {
    const payload = await checkFixture("better-auth-missing-skill");


    const addFinding = payload.findings.find(
      (f) =>
        f.action === "add" &&
        f.subject === "skill:better-auth" &&
        f.ruleId === "better-auth.missing-skill",
    );
    expect(addFinding).toBeDefined();
  });

  test("lockfile drift → both directions reported end to end", async () => {
    const payload = await checkFixture("lock-drift");
    const byRule = new Map(payload.findings.map((f) => [f.ruleId, f.subject]));

    // pinned in skills-lock.json but absent from disk
    expect(byRule.get("skill.locked-not-installed")).toBe(
      "skill:pinned-but-gone",
    );
    // on disk but the lockfile does not track it
    expect(byRule.get("skill.not-in-lock")).toBe("skill:local-only");
  });

  test("--fail-on warning exits 1 on lockfile drift", async () => {
    const result = await runCheck({
      dir: join(fixturesRoot, "lock-drift"),
      failOn: "warning",
    });
    expect(result.exitCode).toBe(1);
  });

  test("clean → zero actionable findings", async () => {
    const payload = await checkFixture("clean-repo");
    expect(actionableFindings(payload.findings)).toEqual([]);
  });

  test("--fail-on warning exits 1 on a warning finding, 0 on a clean tree", async () => {
    const dirty = await runCheck({
      dir: join(fixturesRoot, "next16-redundant-skill"),
      failOn: "warning",
    });
    expect(dirty.exitCode).toBe(1);

    const clean = await runCheck({
      dir: join(fixturesRoot, "clean-repo"),
      failOn: "warning",
    });
    expect(clean.exitCode).toBe(0);
  });

  test("same tree twice → identical JSON", async () => {
    const opts = {
      dir: join(fixturesRoot, "next16-redundant-skill"),
      json: true,
      failOn: "never" as const,
    };
    const first = await runCheck(opts);
    const second = await runCheck(opts);
    expect(first.stdout).toBe(second.stdout);
  });
});
