// tests/unit/rules-load.test.ts
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRules } from "../../src/rules/load";
import { skillMatchesPattern } from "../../src/rules/glob";

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

describe("loadRules", () => {
  test("returns empty list if builtin dir missing", () => {
    const rules = loadRules({
      builtinDir: join(tmpdir(), "agentscan-no-such-builtin-dir"),
      ignoreRules: [],
    });
    expect(rules).toEqual([]);
  });

  test("loads valid yaml rules and skips ignored ids", () => {
    const dir = mkdtempSync(join(tmpdir(), "agentscan-rules-"));
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
    const builtin = mkdtempSync(join(tmpdir(), "agentscan-builtin-"));
    const user = mkdtempSync(join(tmpdir(), "agentscan-user-"));
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

  test("user rule with same id overrides builtin, keeping its position", () => {
    const builtin = mkdtempSync(join(tmpdir(), "agentscan-builtin-"));
    const user = mkdtempSync(join(tmpdir(), "agentscan-user-"));
    writeFileSync(
      join(builtin, "a.yaml"),
      `
id: budget.skills
when: {}
then:
  action: warn
  severity: info
  message: builtin version
`,
    );
    writeFileSync(
      join(builtin, "z.yaml"),
      `
id: other.builtin
when: {}
then:
  action: warn
  severity: info
  message: untouched
`,
    );
    writeFileSync(
      join(user, "override.yaml"),
      `
id: budget.skills
when: {}
then:
  action: warn
  severity: warning
  message: user version
`,
    );

    const rules = loadRules({
      builtinDir: builtin,
      userRulesDir: user,
      ignoreRules: [],
    });

    // exactly one rule per id — no duplicate finding ids downstream
    expect(rules.map((r) => r.id)).toEqual(["budget.skills", "other.builtin"]);
    expect(rules[0]?.then.message).toBe("user version");
  });

  test("skips missing userRulesDir without throwing", () => {
    const builtin = mkdtempSync(join(tmpdir(), "agentscan-builtin-"));
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
      userRulesDir: join(tmpdir(), "agentscan-no-user-rules"),
      ignoreRules: [],
    });

    expect(rules).toHaveLength(1);
  });

  test("throws on invalid rule missing required fields", () => {
    const dir = mkdtempSync(join(tmpdir(), "agentscan-bad-rule-"));
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
    const dir = mkdtempSync(join(tmpdir(), "agentscan-empty-rules-"));
    // ensure empty (no yaml)
    mkdirSync(join(dir, "subdir"), { recursive: true });
    const rules = loadRules({ builtinDir: dir, ignoreRules: [] });
    expect(rules).toEqual([]);
  });
});
