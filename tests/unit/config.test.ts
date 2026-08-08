// tests/unit/config.test.ts
import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../src/config/load";
import { defaultConfig } from "../../src/config/schema";

describe("loadConfig", () => {
  test("returns defaults when no rc file", () => {
    const root = mkdtempSync(join(tmpdir(), "skillscan-"));
    const cfg = loadConfig(root);
    expect(cfg.failOn).toBe("never");
    expect(cfg.skillPaths).toEqual(defaultConfig.skillPaths);
  });

  test("merges .skillscanrc.json", () => {
    const root = mkdtempSync(join(tmpdir(), "skillscan-"));
    writeFileSync(
      join(root, ".skillscanrc.json"),
      JSON.stringify({ ignoreSkills: ["keep-me"], failOn: "warning" }),
    );
    const cfg = loadConfig(root);
    expect(cfg.ignoreSkills).toEqual(["keep-me"]);
    expect(cfg.failOn).toBe("warning");
  });
});
