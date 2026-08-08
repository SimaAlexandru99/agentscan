// tests/unit/init.test.ts
import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit } from "../../src/commands/init";
import { defaultConfig } from "../../src/config/schema";

describe("runInit", () => {
  test("writes .skillscanrc.json with defaultConfig", async () => {
    const root = mkdtempSync(join(tmpdir(), "skillscan-init-"));
    const result = await runInit(root);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(".skillscanrc.json");

    const path = join(root, ".skillscanrc.json");
    expect(existsSync(path)).toBe(true);

    const written = JSON.parse(readFileSync(path, "utf8")) as unknown;
    expect(written).toEqual(defaultConfig);
  });

  test("refuses overwrite without --force", async () => {
    const root = mkdtempSync(join(tmpdir(), "skillscan-init-"));
    const path = join(root, ".skillscanrc.json");
    writeFileSync(path, JSON.stringify({ failOn: "error" }), "utf8");

    const result = await runInit(root);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("Refusing to overwrite");
    expect(result.stderr).toContain("--force");

    const kept = JSON.parse(readFileSync(path, "utf8")) as { failOn: string };
    expect(kept.failOn).toBe("error");
  });

  test("overwrites with --force", async () => {
    const root = mkdtempSync(join(tmpdir(), "skillscan-init-"));
    const path = join(root, ".skillscanrc.json");
    writeFileSync(path, JSON.stringify({ failOn: "error" }), "utf8");

    const result = await runInit(root, { force: true });

    expect(result.exitCode).toBe(0);
    const written = JSON.parse(readFileSync(path, "utf8")) as unknown;
    expect(written).toEqual(defaultConfig);
  });
});
