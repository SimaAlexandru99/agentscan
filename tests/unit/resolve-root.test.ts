import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hasAgentConfigSignal, resolveRoot } from "../../src/discover/index";

describe("resolveRoot", () => {
  test("uses package.json when present", () => {
    const root = mkdtempSync(join(tmpdir(), "agentscan-root-pkg-"));
    writeFileSync(join(root, "package.json"), '{"name":"x"}', "utf8");
    const nested = join(root, "a", "b");
    mkdirSync(nested, { recursive: true });
    expect(resolveRoot(nested)).toBe(root);
  });

  test("uses a .claude directory without package.json", () => {
    const root = mkdtempSync(join(tmpdir(), "agentscan-root-claude-"));
    mkdirSync(join(root, ".claude"), { recursive: true });
    expect(hasAgentConfigSignal(root)).toBe(true);
    expect(resolveRoot(root)).toBe(root);
  });

  test("prefers the starting agent-config dir over a parent package.json", () => {
    const parent = mkdtempSync(join(tmpdir(), "agentscan-root-parent-"));
    writeFileSync(join(parent, "package.json"), '{"name":"mono"}', "utf8");
    const child = join(parent, "notes");
    mkdirSync(join(child, ".claude"), { recursive: true });
    expect(resolveRoot(child)).toBe(child);
  });

  test("throws when there is nothing to scan", () => {
    const empty = mkdtempSync(join(tmpdir(), "agentscan-root-empty-"));
    expect(() => resolveRoot(empty)).toThrow(
      /No package\.json or agent configuration found/,
    );
  });
});
