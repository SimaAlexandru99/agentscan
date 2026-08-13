import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "../..");
const cli = join(repoRoot, "dist/cli.js");
const fixturesRoot = join(repoRoot, "tests/fixtures");

type JsonReport = {
  version: string;
  findings: { ruleId: string; severity: string }[];
};

function runCli(...args: string[]) {
  if (!existsSync(cli)) {
    throw new Error("dist/cli.js is missing; run `bun run build` before the contract tests");
  }

  return spawnSync("node", [cli, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

describe("built CLI contract", () => {
  test("Node executes version and help", () => {
    const version = runCli("--version");
    expect(version.status).toBe(0);
    expect(version.stdout.trim()).toBe("0.5.0");

    const help = runCli("--help");
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("Usage:");
    expect(help.stdout).toContain("--fail-on <level>");
  });

  test("clean JSON succeeds and drift fails at warning severity", () => {
    const clean = runCli("check", join(fixturesRoot, "clean-repo"), "--json");
    expect(clean.status).toBe(0);
    const cleanReport = JSON.parse(clean.stdout) as JsonReport;
    expect(cleanReport.version).toBe("0.5.0");
    expect(cleanReport.findings).toEqual([]);

    const drift = runCli(
      "check",
      join(fixturesRoot, "lock-drift"),
      "--json",
      "--fail-on",
      "warning",
    );
    expect(drift.status).toBe(1);
    const driftReport = JSON.parse(drift.stdout) as JsonReport;
    expect(driftReport.findings.some((finding) => finding.severity === "warning")).toBe(
      true,
    );
  });

  test("an error finding fails --fail-on error", () => {
    const dir = mkdtempSync(join(tmpdir(), "agentscan-cli-contract-"));
    writeFileSync(join(dir, "package.json"), "{not json", "utf8");

    const result = runCli("check", dir, "--json", "--fail-on", "error");
    expect(result.status).toBe(1);
    const report = JSON.parse(result.stdout) as JsonReport;
    expect(report.findings.some((finding) => finding.ruleId === "config.unreadable")).toBe(
      true,
    );
  });

  test("unknown options return the CLI usage error code", () => {
    const result = runCli("--bogus");
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Unknown option");
  });
});
