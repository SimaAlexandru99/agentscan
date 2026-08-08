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

    expect(payload.version).toBe("0.1.0");

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

    expect(payload.version).toBe("0.1.0");

    const addFinding = payload.findings.find(
      (f) =>
        f.action === "add" &&
        f.subject === "skill:better-auth" &&
        f.ruleId === "better-auth.missing-skill",
    );
    expect(addFinding).toBeDefined();
  });

  test("orphan → info warn skill.orphan (still in JSON)", async () => {
    const payload = await checkFixture("orphan-skill");

    expect(payload.version).toBe("0.1.0");

    const orphanFinding = payload.findings.find(
      (f) =>
        f.subject === "skill:totally-orphan-xyz" &&
        f.ruleId === "skill.orphan",
    );
    expect(orphanFinding).toBeDefined();
    expect(orphanFinding?.action).toBe("warn");
  });

  test("orphan collapsed in default text report", async () => {
    const result = await runCheck({
      dir: join(fixturesRoot, "orphan-skill"),
      failOn: "never",
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("ORPHAN");
    expect(result.stdout).toMatch(/1 skills/);
    expect(result.stdout).not.toContain("totally-orphan-xyz");
    expect(result.stdout).not.toMatch(/info hidden/);
  });

  test("orphan listed when verbose", async () => {
    const result = await runCheck({
      dir: join(fixturesRoot, "orphan-skill"),
      failOn: "never",
      verbose: true,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("totally-orphan-xyz");
    expect(result.stdout).not.toMatch(/ORPHAN  \d+ skills/);
  });

  test("clean → zero high-signal actionable findings", async () => {
    const payload = await checkFixture("clean-repo");

    expect(payload.version).toBe("0.1.0");
    // orphans are info/warn — exclude info-level noise from "actionable"
    const highSignal = payload.findings.filter(
      (f) =>
        ACTIONABLE.has(f.action) &&
        f.ruleId !== "skill.orphan",
    );
    expect(highSignal).toEqual([]);
  });
});
