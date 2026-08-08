// tests/unit/engine.test.ts
import { describe, expect, test } from "bun:test";
import { defaultConfig } from "../../src/config/schema";
import type { Facts, SkillFact } from "../../src/facts/types";
import { runRules } from "../../src/rules/engine";
import type { RuleDefinition } from "../../src/rules/schema";

function skill(
  id: string,
  path = `.agents/skills/${id}`,
): SkillFact {
  return { id, path, source: "project" };
}

function baseFacts(overrides: Partial<Facts> = {}): Facts {
  return {
    root: "/tmp/proj",
    packageManager: "bun",
    dependencies: {},
    devDependencies: {},
    scripts: {},
    configs: {},
    skills: [],
    agents: [],
    hooks: [],
    mcp: [],
    policyFiles: [],
    ...overrides,
  };
}

const nextRedundantRule: RuleDefinition = {
  id: "next.redundant-cache-components-skill",
  description: "Next 16+ cache skill redundant",
  when: {
    all: [
      { dep: "next", gte: "16.0.0" },
      { skillMatches: ["next-cache-components", "next-cache"] },
    ],
  },
  then: {
    action: "delete",
    severity: "warning",
    subject: "skill:{{matchedSkill}}",
    message: "Redundant Next cache skill — prefer node_modules/next docs",
    reason: "next >= 16 documents cache components",
    suggest: "rm -rf {{matchedSkillPath}}",
  },
};

const betterAuthMissingRule: RuleDefinition = {
  id: "better-auth.missing-skill",
  description: "better-auth installed but no matching skill",
  when: {
    all: [
      { dep: "better-auth" },
      {
        not: {
          skillMatches: ["better-auth*", "best-practices"],
        },
      },
    ],
  },
  then: {
    action: "add",
    severity: "warning",
    subject: "skill:better-auth",
    message: "Missing better-auth skill while better-auth is a dependency",
    reason: "Mapped dep better-auth has no matching skill",
    suggest: "Add a better-auth* skill for agent auth guidance",
  },
};

const orphanRule: RuleDefinition = {
  id: "skill.orphan",
  description: "Orphan skill",
  when: {
    perSkill: { orphan: true },
  },
  then: {
    action: "delete",
    severity: "warning",
    subject: "skill:{{matchedSkill}}",
    message:
      "Orphan skill — no matching dependency and not referenced in AGENTS.md/CLAUDE.md",
    reason: "No dep→skill map hit and name not in policy files",
    suggest: "rm -rf {{matchedSkillPath}}",
  },
};

const packageManagerDriftRule: RuleDefinition = {
  id: "policy.package-manager-drift",
  description: "Policy mentions npm install while project uses bun",
  when: {
    all: [
      { packageManager: "bun" },
      { policyMatches: "npm install" },
    ],
  },
  then: {
    action: "drift",
    severity: "info",
    subject: "policy:package-manager",
    message: "Policy mentions npm install but packageManager is bun",
    reason: "Docs drift vs packageManager field",
    suggest: "Prefer bun install in AGENTS.md / CLAUDE.md",
  },
};

describe("runRules", () => {
  test("next 16 + skill next-cache-components → redundant delete finding", () => {
    const facts = baseFacts({
      dependencies: { next: "^16.3.0" },
      skills: [skill("next-cache-components")],
    });

    const findings = runRules(facts, [nextRedundantRule], defaultConfig);

    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.ruleId).toBe("next.redundant-cache-components-skill");
    expect(f.action).toBe("delete");
    expect(f.subject).toBe("skill:next-cache-components");
    expect(f.id).toBe(
      "next.redundant-cache-components-skill:skill:next-cache-components",
    );
    expect(f.suggest).toBe("rm -rf .agents/skills/next-cache-components");
    expect(f.message).toContain("Redundant Next cache");
  });

  test("next 15 does not trigger redundant cache rule", () => {
    const facts = baseFacts({
      dependencies: { next: "15.2.0" },
      skills: [skill("next-cache-components")],
    });
    const findings = runRules(facts, [nextRedundantRule], defaultConfig);
    expect(findings).toHaveLength(0);
  });

  test("multiple matching skills emit one finding each", () => {
    const facts = baseFacts({
      dependencies: { next: "16.0.0" },
      skills: [skill("next-cache-components"), skill("next-cache")],
    });
    const findings = runRules(facts, [nextRedundantRule], defaultConfig);
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.subject).sort()).toEqual([
      "skill:next-cache",
      "skill:next-cache-components",
    ]);
  });

  test("better-auth dep, no skill → add finding", () => {
    const facts = baseFacts({
      dependencies: { "better-auth": "^1.0.0" },
      skills: [],
    });

    const findings = runRules(facts, [betterAuthMissingRule], defaultConfig);

    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.ruleId).toBe("better-auth.missing-skill");
    expect(f.action).toBe("add");
    expect(f.subject).toBe("skill:better-auth");
    expect(f.id).toBe("better-auth.missing-skill:skill:better-auth");
  });

  test("better-auth dep + matching skill → no add finding", () => {
    const facts = baseFacts({
      dependencies: { "better-auth": "1.0.0" },
      skills: [skill("better-auth-best-practices")],
    });
    const findings = runRules(facts, [betterAuthMissingRule], defaultConfig);
    expect(findings).toHaveLength(0);
  });

  test("skill random-foo no dep → orphan delete", () => {
    const facts = baseFacts({
      dependencies: { next: "16.0.0" },
      skills: [skill("random-foo", ".agents/skills/random-foo")],
    });

    const findings = runRules(facts, [orphanRule], defaultConfig);

    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.ruleId).toBe("skill.orphan");
    expect(f.action).toBe("delete");
    expect(f.subject).toBe("skill:random-foo");
    expect(f.id).toBe("skill.orphan:skill:random-foo");
    expect(f.suggest).toBe("rm -rf .agents/skills/random-foo");
  });

  test("skill matching DEP_SKILL_MAP for installed dep is not orphan", () => {
    const facts = baseFacts({
      dependencies: { next: "16.0.0" },
      skills: [skill("next-cache-components")],
    });
    const findings = runRules(facts, [orphanRule], defaultConfig);
    expect(findings).toHaveLength(0);
  });

  test("skill mentioned in policy is not orphan", () => {
    const facts = baseFacts({
      skills: [skill("custom-workflow")],
      policyFiles: [
        {
          path: "AGENTS.md",
          text: "Use custom-workflow for deploys",
        },
      ],
    });
    const findings = runRules(facts, [orphanRule], defaultConfig);
    expect(findings).toHaveLength(0);
  });

  test("ignoreSkills skips findings for that skill id", () => {
    const facts = baseFacts({
      dependencies: { next: "16.0.0" },
      skills: [skill("next-cache-components"), skill("next-cache")],
    });
    const findings = runRules(facts, [nextRedundantRule], {
      ...defaultConfig,
      ignoreSkills: ["next-cache-components"],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.subject).toBe("skill:next-cache");
  });

  test("ignoreRules skips entire rule", () => {
    const facts = baseFacts({
      dependencies: { next: "16.0.0" },
      skills: [skill("next-cache-components")],
    });
    const findings = runRules(facts, [nextRedundantRule], {
      ...defaultConfig,
      ignoreRules: ["next.redundant-cache-components-skill"],
    });
    expect(findings).toHaveLength(0);
  });

  test("package-manager drift when policy says npm install under bun", () => {
    const facts = baseFacts({
      packageManager: "bun",
      policyFiles: [
        { path: "AGENTS.md", text: "Always run npm install first." },
      ],
    });
    const findings = runRules(
      facts,
      [packageManagerDriftRule],
      defaultConfig,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.ruleId).toBe("policy.package-manager-drift");
    expect(findings[0]!.action).toBe("drift");
  });

  test("finding includes evidence for dep and skill", () => {
    const facts = baseFacts({
      dependencies: { next: "^16.3.0" },
      skills: [skill("next-cache-components")],
    });
    const findings = runRules(facts, [nextRedundantRule], defaultConfig);
    const kinds = findings[0]!.evidence.map((e) => e.kind);
    expect(kinds).toContain("dep");
    expect(kinds).toContain("skill");
  });
});
