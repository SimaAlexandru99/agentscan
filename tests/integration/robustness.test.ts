import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCheck } from "../../src/commands/check";

/**
 * Cases found by running the CLI against hostile input. Each one used to be
 * silently wrong rather than loud — the failure mode this tool exists to fix.
 */

type JsonReport = {
  root: string;
  resolvedFrom?: string;
  findings: { ruleId: string; severity: string; message: string }[];
};

function project(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "agentscan-robust-"));
  for (const [rel, body] of Object.entries(files)) {
    const path = join(dir, rel);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, body, "utf8");
  }
  return dir;
}

async function report(dir: string): Promise<JsonReport> {
  const result = await runCheck({ dir, json: true, failOn: "never" });
  return JSON.parse(result.stdout) as JsonReport;
}

describe("unreadable input is reported, never swallowed", () => {
  test("a corrupt package.json is an error finding", async () => {
    const dir = project({ "package.json": "{not json" });
    const payload = await report(dir);

    const finding = payload.findings.find((f) => f.ruleId === "config.unreadable");
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("error");
    expect(finding?.message).toContain("package.json");
  });

  test("a corrupt package.json fails --fail-on error", async () => {
    const dir = project({ "package.json": "{not json" });
    const result = await runCheck({ dir, failOn: "error" });
    expect(result.exitCode).toBe(1);
  });

  test("a valid package.json produces no config error", async () => {
    const dir = project({ "package.json": '{"name":"ok"}' });
    const payload = await report(dir);
    expect(payload.findings.filter((f) => f.ruleId === "config.unreadable")).toEqual(
      [],
    );
  });

  test("an unreadable SKILL.md is not misreported as missing frontmatter", async () => {
    const dir = project({
      "package.json": '{"name":"p"}',
      ".agents/skills/x/SKILL.md": "---\nname: x\ndescription: d\n---\n",
    });
    chmodSync(join(dir, ".agents/skills/x/SKILL.md"), 0o000);

    try {
      const payload = await report(dir);
      const ids = payload.findings.map((f) => f.ruleId);

      // the file may well have valid frontmatter — we simply could not read it,
      // and telling the user to add frontmatter sends them to fix a correct file
      expect(ids).not.toContain("skill.missing-frontmatter");
      expect(ids).toContain("config.unreadable");
    } finally {
      chmodSync(join(dir, ".agents/skills/x/SKILL.md"), 0o644);
    }
  });
});

describe("root resolution is visible", () => {
  test("a directory with no package.json reports which root it walked up to", async () => {
    const parent = project({ "package.json": '{"name":"parent"}' });
    const nested = join(parent, "sub", "deeper");
    mkdirSync(nested, { recursive: true });

    const payload = await report(nested);

    expect(payload.root).toBe(parent);
    expect(payload.resolvedFrom).toBe(nested);
  });

  test("resolvedFrom is absent when the directory is the root", async () => {
    const dir = project({ "package.json": '{"name":"here"}' });
    const payload = await report(dir);

    expect(payload.root).toBe(dir);
    expect(payload.resolvedFrom).toBeUndefined();
  });

  test("text report names the walked-up root", async () => {
    const parent = project({ "package.json": '{"name":"parent"}' });
    const nested = join(parent, "sub");
    mkdirSync(nested, { recursive: true });

    const result = await runCheck({ dir: nested, failOn: "never" });

    expect(result.stdout).toContain("no package.json in");
    expect(result.stdout).toContain(parent);
  });
});
