import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { runDemo } from "../../src/commands/demo";

type JsonReport = {
  findings: { ruleId: string; severity: string }[];
};

function demoTempDirCount(): number {
  return readdirSync(tmpdir()).filter((name) => name.startsWith("agentscan-demo-"))
    .length;
}

describe("runDemo", () => {
  test("stages the three headline findings and exits 0", async () => {
    const result = await runDemo({ output: "json" });

    expect(result.exitCode).toBe(0);
    const report = JSON.parse(result.stdout) as JsonReport;
    const ruleIds = report.findings.map((finding) => finding.ruleId);

    expect(ruleIds).toContain("hook.missing-script");
    expect(ruleIds).toContain("mcp.no-launch");
    expect(ruleIds).toContain("skill.locked-not-installed");
  });

  test("human output is a real report and never fails", async () => {
    const result = await runDemo();

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("agentscan");
    expect(result.stderr).toContain("throwaway");
  });

  test("removes its throwaway fixture", async () => {
    const before = demoTempDirCount();
    await runDemo({ output: "json" });
    const after = demoTempDirCount();

    expect(after).toBe(before);
  });
});
