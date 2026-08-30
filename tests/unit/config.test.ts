// tests/unit/config.test.ts
import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../src/config/load";
import { defaultConfig } from "../../src/config/schema";

describe("ignoreFindings", () => {
  test("defaults to empty", () => {
    const dir = mkdtempSync(join(tmpdir(), "agentscan-cfg-"));
    expect(loadConfig(dir).ignoreFindings).toEqual([]);
  });

  test("round-trips from the config file", () => {
    const dir = mkdtempSync(join(tmpdir(), "agentscan-cfg-"));
    writeFileSync(
      join(dir, ".agentscanrc.json"),
      JSON.stringify({ ignoreFindings: ["claude.hook.missing-script:hook:X:./a.sh"] }),
      "utf8",
    );
    expect(loadConfig(dir).ignoreFindings).toEqual([
      "claude.hook.missing-script:hook:X:./a.sh",
    ]);
  });
});

describe("loadConfig", () => {
  test("returns defaults when no rc file", () => {
    const root = mkdtempSync(join(tmpdir(), "agentscan-"));
    const cfg = loadConfig(root);
    expect(cfg.failOn).toBe("never");
    expect(cfg.skillPaths).toEqual(defaultConfig.skillPaths);
    expect(cfg.thresholds.skills).toBeUndefined();
    expect(cfg.thresholds.mcp).toBe(5);
  });

  test("merges .agentscanrc.json", () => {
    const root = mkdtempSync(join(tmpdir(), "agentscan-"));
    writeFileSync(
      join(root, ".agentscanrc.json"),
      JSON.stringify({ ignoreSkills: ["keep-me"], failOn: "warning" }),
    );
    const cfg = loadConfig(root);
    expect(cfg.ignoreSkills).toEqual(["keep-me"]);
    expect(cfg.failOn).toBe("warning");
  });

  test("rejects unknown root keys but accepts legacy skills threshold", () => {
    const root = mkdtempSync(join(tmpdir(), "agentscan-"));
    writeFileSync(join(root, ".agentscanrc.json"), JSON.stringify({
      failon: "warning",
      thresholds: { skills: 30 },
    }));
    expect(() => loadConfig(root)).toThrow();
    writeFileSync(join(root, ".agentscanrc.json"), JSON.stringify({
      thresholds: { skills: 30 },
    }));
    expect(loadConfig(root).thresholds.skills).toBe(30);
  });
});
