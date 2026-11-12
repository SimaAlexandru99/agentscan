import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { runCheck } from "../../src/commands/check";
import { tmpProject, write } from "../helpers/tmp";

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
  message: string;
};

type JsonReport = {
  version: string;
  findings: FindingPayload[];
};

async function checkFixture(name: string): Promise<JsonReport> {
  const result = await runCheck({
    dir: join(fixturesRoot, name),
    output: "json",
    failOn: "never",
  });

  expect(result.exitCode).toBe(0);

  return JSON.parse(result.stdout) as JsonReport;
}

function actionableFindings(findings: FindingPayload[]): FindingPayload[] {
  return findings.filter((f) => ACTIONABLE.has(f.action));
}

describe("runCheck integration", () => {
  test("lockfile drift → both directions reported end to end", async () => {
    const payload = await checkFixture("lock-drift");
    const byRule = new Map(payload.findings.map((f) => [f.ruleId, f.subject]));

    // pinned in skills-lock.json but absent from disk
    expect(byRule.get("skill.locked-not-installed")).toBe(
      "skill:pinned-but-gone",
    );
    // on disk but the lockfile does not track it
    expect(byRule.get("skill.not-in-lock")).toBe("skill:local-only");
    // nothing else: the skill's frontmatter and the lockfile both parsed
    expect([...byRule.keys()].sort()).toEqual(["skill.locked-not-installed", "skill.not-in-lock"]);
    const pinned = payload.findings.find((f) => f.ruleId === "skill.locked-not-installed");
    expect(pinned?.message).toContain("someone/skills");
  });

  test("clean → zero actionable findings", async () => {
    const payload = await checkFixture("clean-repo");
    expect(actionableFindings(payload.findings)).toEqual([]);
  });

  test("same tree twice → identical JSON", async () => {
    const opts = {
      dir: join(fixturesRoot, "lock-drift"),
      output: "json" as const,
      failOn: "never" as const,
    };
    const first = await runCheck(opts);
    const second = await runCheck(opts);
    expect(first.stdout).toBe(second.stdout);
  });
});

/** One tree per worst severity: corrupt package.json (error), lock drift (warning + info), an oversized Cursor rule (info). */
function tree(worst: "error" | "warning" | "info" | "clean"): string {
  if (worst === "warning") return join(fixturesRoot, "lock-drift");
  if (worst === "clean") return join(fixturesRoot, "clean-repo");
  const root = tmpProject("agentscan-exit-");
  if (worst === "error") write(root, "package.json", "{not json");
  else write(root, ".cursor/rules/big.mdc", "line\n".repeat(501));
  return root;
}

describe("--fail-on decides the exit code", () => {
  test.each([
    ["error", "never", 0],
    ["error", "warning", 1],
    ["error", "error", 1],
    ["warning", "never", 0],
    ["warning", "warning", 1],
    ["warning", "error", 0],
    ["info", "warning", 0],
    ["info", "error", 0],
    ["clean", "warning", 0],
    ["clean", "error", 0],
  ] as const)("worst %s, --fail-on %s -> %d", (worst, failOn, code) => {
    expect(runCheck({ dir: tree(worst), output: "json", failOn }).exitCode).toBe(code);
  });
});
