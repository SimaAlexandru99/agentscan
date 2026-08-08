// tests/unit/rules-load.test.ts
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRules } from "../../src/rules/load";
import { DEP_SKILL_MAP, skillMatchesPattern } from "../../src/rules/map";

describe("skillMatchesPattern", () => {
  test("glob suffix", () => {
    expect(
      skillMatchesPattern("better-auth-best-practices", "better-auth*"),
    ).toBe(true);
    expect(skillMatchesPattern("shadcn", "prisma*")).toBe(false);
  });

  test("glob prefix", () => {
    expect(skillMatchesPattern("my-prisma-helper", "*prisma*")).toBe(false);
    expect(skillMatchesPattern("use-prisma", "*prisma")).toBe(true);
    expect(skillMatchesPattern("prisma-client", "*prisma")).toBe(false);
  });

  test("exact match", () => {
    expect(skillMatchesPattern("better-auth", "better-auth*")).toBe(true);
    expect(skillMatchesPattern("best-practices-extra", "best-practices")).toBe(      false,
    );
  });

  test("next-* style", () => {
    expect(skillMatchesPattern("next-cache-components", "next-*")).toBe(true);
    expect(skillMatchesPattern("next", "next-*")).toBe(false);
  });
});

describe("DEP_SKILL_MAP", () => {
  test("includes seed rows from spec §8.1", () => {
    const deps = DEP_SKILL_MAP.map((e) => e.dep);
    expect(deps).toContain("next");
    expect(deps).toContain("better-auth");
    expect(deps).toContain("@tanstack/react-query");
    expect(deps).toContain("shadcn");
    expect(deps).toContain("@prisma/client");
    expect(deps).toContain("prisma");
    expect(deps).toContain("zod");

    const next = DEP_SKILL_MAP.find((e) => e.dep === "next");
    expect(next?.skillPatterns).toContain("next-*");

    const betterAuth = DEP_SKILL_MAP.find((e) => e.dep === "better-auth");
    expect(betterAuth?.skillPatterns).toEqual(["better-auth*"]);

  });
});

describe("loadRules", () => {
  test("returns empty list if builtin dir missing", () => {
    const rules = loadRules({
      builtinDir: join(tmpdir(), "skillscan-no-such-builtin-dir"),
      ignoreRules: [],
    });
    expect(rules).toEqual([]);
  });

  test("loads valid yaml rules and skips ignored ids", () => {
    const dir = mkdtempSync(join(tmpdir(), "skillscan-rules-"));
    writeFileSync(
      join(dir, "keep-me.yaml"),
      `
id: rule.keep
description: sample
when:
  all:
    - dep: next
then:
  action: warn
  severity: info
  message: keep this rule
`,
    );
    writeFileSync(
      join(dir, "skip-me.yaml"),
      `
id: rule.skip
when: {}
then:
  action: delete
  severity: warning
  message: should be ignored
`,
    );

    const rules = loadRules({
      builtinDir: dir,
      ignoreRules: ["rule.skip"],
    });

    expect(rules).toHaveLength(1);
    expect(rules[0]?.id).toBe("rule.keep");
    expect(rules[0]?.then.action).toBe("warn");
    expect(rules[0]?.then.message).toBe("keep this rule");
    expect(rules[0]?.when).toEqual({ all: [{ dep: "next" }] });
  });

  test("merges user rules after builtin", () => {
    const builtin = mkdtempSync(join(tmpdir(), "skillscan-builtin-"));
    const user = mkdtempSync(join(tmpdir(), "skillscan-user-"));
    writeFileSync(
      join(builtin, "a.yaml"),
      `
id: builtin.a
when: {}
then:
  action: keep
  severity: info
  message: builtin
`,
    );
    writeFileSync(
      join(user, "b.yml"),
      `
id: user.b
when: {}
then:
  action: add
  severity: info
  message: user
`,
    );

    const rules = loadRules({
      builtinDir: builtin,
      userRulesDir: user,
      ignoreRules: [],
    });

    expect(rules.map((r) => r.id)).toEqual(["builtin.a", "user.b"]);
  });

  test("skips missing userRulesDir without throwing", () => {
    const builtin = mkdtempSync(join(tmpdir(), "skillscan-builtin-"));
    writeFileSync(
      join(builtin, "a.yaml"),
      `
id: builtin.a
when: {}
then:
  action: keep
  severity: info
  message: builtin
`,
    );

    const rules = loadRules({
      builtinDir: builtin,
      userRulesDir: join(tmpdir(), "skillscan-no-user-rules"),
      ignoreRules: [],
    });

    expect(rules).toHaveLength(1);
  });

  test("throws on invalid rule missing required fields", () => {
    const dir = mkdtempSync(join(tmpdir(), "skillscan-bad-rule-"));
    writeFileSync(
      join(dir, "bad.yaml"),
      `
id: incomplete
when: {}
then:
  action: warn
`,
    );

    expect(() =>
      loadRules({ builtinDir: dir, ignoreRules: [] }),
    ).toThrow();
  });

  test("empty builtin dir yields empty list", () => {
    const dir = mkdtempSync(join(tmpdir(), "skillscan-empty-rules-"));
    // ensure empty (no yaml)
    mkdirSync(join(dir, "subdir"), { recursive: true });
    const rules = loadRules({ builtinDir: dir, ignoreRules: [] });
    expect(rules).toEqual([]);
  });
});
