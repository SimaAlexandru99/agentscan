// tests/unit/report.test.ts
import { describe, expect, test } from "bun:test";
import type { Facts, Finding, SkillFact } from "../../src/facts/types";
import { exitCode } from "../../src/report/exit-code";
import { renderJson } from "../../src/report/json";
import { sortFindings } from "../../src/report/sort";
import { renderText } from "../../src/report/text";

function finding(partial: Partial<Finding> & Pick<Finding, "id" | "action" | "severity">): Finding {
  return {
    ruleId: partial.ruleId ?? "rule.x",
    subject: partial.subject ?? "skill:x",
    message: partial.message ?? "msg",
    reason: partial.reason ?? "reason",
    evidence: partial.evidence ?? [],
    ...partial,
  };
}

function skillFact(id: string): SkillFact {
  return {
    id,
    path: `.agents/skills/${id}`,
    source: "project",
    hasSkillMd: true,
    hasFrontmatter: true,
    frontmatterName: id,
    description: "d",
  };
}

function baseFacts(overrides: Partial<Facts> = {}): Facts {
  return {
    root: "/tmp/my-app",
    packageManager: "bun",
    dependencies: { next: "16.3.0", "better-auth": "1.2.0" },
    devDependencies: { typescript: "5.8.0" },
    scripts: {},
    configs: {},
    skills: [skillFact("next-cache-components")],
    agents: [],
    hooks: [],
    mcp: [],
    policyFiles: [{ path: "AGENTS.md", text: "huge policy should not appear in json" }],
    lockedSkills: [],
    hasSkillsLock: false,
    configErrors: [],
    ...overrides,
  };
}

describe("sortFindings", () => {
  test("orders by severity error > warning > info, then action, then id", () => {
    const input = [
      finding({ id: "b:skill:a", action: "warn", severity: "info", subject: "skill:a" }),
      finding({ id: "a:skill:z", action: "delete", severity: "error", subject: "skill:z" }),
      finding({ id: "c:skill:m", action: "add", severity: "warning", subject: "skill:m" }),
      finding({ id: "a:skill:a", action: "delete", severity: "error", subject: "skill:a" }),
      finding({ id: "c:skill:a", action: "delete", severity: "warning", subject: "skill:a" }),
    ];

    const sorted = sortFindings(input);

    expect(sorted.map((f) => f.id)).toEqual([
      "a:skill:a", // error, delete, a…
      "a:skill:z", // error, delete, z…
      "c:skill:m", // warning, add (action localeCompare)
      "c:skill:a", // warning, delete
      "b:skill:a", // info
    ]);
  });

  test("does not mutate input", () => {
    const input = [
      finding({ id: "2", action: "add", severity: "info" }),
      finding({ id: "1", action: "add", severity: "error" }),
    ];
    const copy = [...input];
    sortFindings(input);
    expect(input.map((f) => f.id)).toEqual(copy.map((f) => f.id));
  });

  test("stable for same severity+action+id order via id", () => {
    const a = finding({ id: "r:skill:a", action: "delete", severity: "warning" });
    const b = finding({ id: "r:skill:b", action: "delete", severity: "warning" });
    expect(sortFindings([b, a]).map((f) => f.id)).toEqual(["r:skill:a", "r:skill:b"]);
  });
});

describe("exitCode", () => {
  const errorFinding = finding({ id: "e", action: "delete", severity: "error" });
  const warningFinding = finding({ id: "w", action: "delete", severity: "warning" });
  const infoFinding = finding({ id: "i", action: "drift", severity: "info" });
  const keepWarning = finding({ id: "k", action: "keep", severity: "warning" });

  test("never → always 0", () => {
    expect(exitCode([errorFinding, warningFinding], "never")).toBe(0);
    expect(exitCode([], "never")).toBe(0);
  });

  test("warning → 1 if any warning|error (non-keep)", () => {
    expect(exitCode([warningFinding], "warning")).toBe(1);
    expect(exitCode([errorFinding], "warning")).toBe(1);
    expect(exitCode([infoFinding], "warning")).toBe(0);
    expect(exitCode([], "warning")).toBe(0);
  });

  test("warning excludes action keep", () => {
    expect(exitCode([keepWarning], "warning")).toBe(0);
    expect(exitCode([keepWarning, infoFinding], "warning")).toBe(0);
    expect(exitCode([keepWarning, warningFinding], "warning")).toBe(1);
  });

  test("error → 1 only if any severity error", () => {
    expect(exitCode([errorFinding], "error")).toBe(1);
    expect(exitCode([warningFinding], "error")).toBe(0);
    expect(exitCode([infoFinding], "error")).toBe(0);
    expect(exitCode([], "error")).toBe(0);
  });
});

describe("renderText", () => {
  const findings: Finding[] = [
    finding({
      id: "next.redundant-cache-components-skill:skill:next-cache-components",
      ruleId: "next.redundant-cache-components-skill",
      action: "delete",
      severity: "warning",
      subject: "skill:next-cache-components",
      message: "Redundant Next cache skill — prefer node_modules/next docs",
      reason: "next >= 16",
      evidence: [
        { kind: "dep", value: "next@16.3.0" },
        { kind: "path", value: ".agents/skills/next-cache-components" },
      ],
    }),
    finding({
      id: "better-auth.missing-skill:skill:better-auth",
      ruleId: "better-auth.missing-skill",
      action: "add",
      severity: "warning",
      subject: "skill:better-auth",
      message: "Missing better-auth skill",
      reason: "mapped dep",
      evidence: [{ kind: "dep", value: "better-auth@1.2.0" }],
    }),
    finding({
      id: "skill.keep:skill:zod",
      ruleId: "skill.keep",
      action: "keep",
      severity: "info",
      subject: "skill:zod",
      message: "Keep skill",
      reason: "used",
      evidence: [],
    }),
  ];

  test("shows DELETE/ADD lines, hides keep unless verbose", () => {
    const text = renderText({
      version: "0.1.0",
      facts: baseFacts(),
      findings,
      verbose: false,
      quiet: false,
    });

    expect(text).toContain("agentscan v0.1.0 — my-app");
    expect(text).toContain("Stack:");
    expect(text).toContain("packageManager=bun");
    expect(text).toContain("DELETE  skill:next-cache-components");
    expect(text).toContain("rule:next.redundant-cache-components-skill");
    expect(text).toContain("Redundant Next cache skill — prefer node_modules/next docs");
    expect(text).toContain("evidence: dep next@16.3.0 · path .agents/skills/next-cache-components");
    expect(text).toContain("ADD     skill:better-auth");
    expect(text).not.toContain("KEEP");
    expect(text).toMatch(/Summary:.*delete.*add/);
  });

  test("verbose includes KEEP findings", () => {
    const text = renderText({
      version: "0.1.0",
      facts: baseFacts(),
      findings,
      verbose: true,
      quiet: false,
    });

    expect(text).toContain("KEEP");
    expect(text).toContain("skill:zod");
  });

  test("hides info severity unless verbose", () => {
    // Non-orphan info still uses info-hidden path (orphans collapse separately).
    const withInfo = [
      ...findings,
      finding({
        id: "policy.x:policy:foo",
        action: "drift",
        severity: "info",
        subject: "policy:foo",
        ruleId: "policy.x",
        message: "Info drift",
      }),
    ];
    const text = renderText({
      version: "0.1.0",
      facts: baseFacts(),
      findings: withInfo,
      verbose: false,
      quiet: false,
    });
    expect(text).not.toContain("policy:foo");
    expect(text).toMatch(/info hidden \(--verbose\)/);
    const verboseText = renderText({
      version: "0.1.0",
      facts: baseFacts(),
      findings: withInfo,
      verbose: true,
      quiet: false,
    });
    expect(verboseText).toContain("policy:foo");
  });

  const deleteFinding = finding({
    id: "d:1",
    action: "delete",
    severity: "warning",
    subject: "skill:next-cache-components",
    ruleId: "next.redundant-cache-components-skill",
    message: "Redundant",
  });

  test("a newline in a subject cannot forge a report line", () => {
    const text = renderText({
      version: "0.1.0",
      facts: baseFacts(),
      findings: [
        finding({
          id: "r:evil",
          action: "warn",
          severity: "warning",
          subject: "evil\nWARN    skill:forged\n        rule:none",
          message: "m",
        }),
      ],
      verbose: false,
      quiet: false,
    });

    // the forged text may appear escaped, but never as lines of its own
    expect(text).not.toMatch(/^WARN {4}skill:forged/m);
    expect(text).not.toMatch(/^ {8}rule:none/m);
  });

  test("control characters from scanned content are escaped, not passed through", () => {
    const text = renderText({
      version: "0.1.0",
      facts: baseFacts(),
      findings: [
        finding({
          id: "r:esc",
          action: "warn",
          severity: "warning",
          subject: "skill:x",
          message: "[31mred[0m",
          evidence: [{ kind: "skill", value: "path[2J" }],
        }),
      ],
      verbose: false,
      quiet: false,
    });

    expect(text).not.toContain("");
    // and the reader can tell something was there
    expect(text).toContain("\\x1b");
  });

  test("an oversized value is truncated with a visible marker", () => {
    const text = renderText({
      version: "0.1.0",
      facts: baseFacts(),
      findings: [
        finding({
          id: "r:long",
          action: "warn",
          severity: "warning",
          subject: `skill:${"a".repeat(5000)}`,
          message: "m",
        }),
      ],
      verbose: false,
      quiet: false,
    });

    expect(text).toContain("…");
    expect(text.split("\n").every((l) => l.length < 300)).toBe(true);
  });

  test("ordinary ASCII output is unchanged by sanitising", () => {
    const text = renderText({
      version: "0.1.0",
      facts: baseFacts(),
      findings,
      verbose: false,
      quiet: false,
    });
    // the exact strings the pre-sanitiser renderer produced
    expect(text).toContain("DELETE  skill:next-cache-components");
    expect(text).toContain(
      "evidence: dep next@16.3.0 · path .agents/skills/next-cache-components",
    );
  });

  test("Stack line splits project and global skills when both are present", () => {
    const global = { ...skillFact("g"), source: "global" as const };
    const text = renderText({
      version: "0.1.0",
      facts: baseFacts({ skills: [skillFact("p"), global] }),
      findings: [],
      verbose: false,
      quiet: false,
    });
    expect(text).toContain("2 skills (1 project + 1 global)");
  });

  test("Stack line is unchanged when there are no global skills", () => {
    const text = renderText({
      version: "0.1.0",
      facts: baseFacts({ skills: [skillFact("p")] }),
      findings: [],
      verbose: false,
      quiet: false,
    });
    expect(text).toContain("1 skills ·");
    expect(text).not.toContain("project +");
  });

  test("Stack line summarises size, not the dependency list", () => {
    const facts = baseFacts({
      dependencies: { next: "16.3.0", "better-auth": "1.2.0" },
      devDependencies: { typescript: "5.8.0" },
      skills: [skillFact("a"), skillFact("b")],
      mcp: [
        {
          name: "m",
          path: ".mcp.json",
          hasCommand: true,
          hasUrl: false,
          literalEnvKeys: [],
          raw: "{}",
        },
      ],
      agents: [{ name: "reviewer", path: ".claude/agents/reviewer.md" }],
    });
    const text = renderText({
      version: "0.1.0",
      facts,
      findings: [],
      verbose: false,
      quiet: false,
    });

    expect(text).toContain(
      "Stack: 3 deps · 2 skills · 1 mcp · 1 agents · packageManager=bun",
    );
    // the dependency names themselves are noise in a config report
    expect(text).not.toContain("typescript");
  });

  test("quiet is summary line only", () => {
    const text = renderText({
      version: "0.1.0",
      facts: baseFacts(),
      findings,
      verbose: false,
      quiet: true,
    });

    expect(text.trimStart().startsWith("Summary:")).toBe(true);
    expect(text).not.toContain("DELETE");
    expect(text).not.toContain("agentscan v");
    expect(text).not.toContain("Stack:");
  });

  test("summary counts actions", () => {
    const text = renderText({
      version: "0.1.0",
      facts: baseFacts(),
      findings,
      verbose: false,
      quiet: true,
    });

    // keep hidden from body but counts may still reflect visible or total — we count all findings
    expect(text).toContain("1 delete");
    expect(text).toContain("1 add");
  });
});

describe("renderJson", () => {
  test("pretty JSON with factsSummary and sorted findings; no full policy text", () => {
    const findings = [
      finding({
        id: "z:info",
        action: "drift",
        severity: "info",
        subject: "policy:x",
        ruleId: "policy.x",
      }),
      finding({
        id: "a:err",
        action: "delete",
        severity: "error",
        subject: "skill:a",
        ruleId: "r",
      }),
    ];

    const raw = renderJson({
      version: "0.1.0",
      root: "/tmp/my-app",
      facts: baseFacts(),
      findings,
    });

    const parsed = JSON.parse(raw) as {
      version: string;
      root: string;
      factsSummary: {
        packageManager: string;
        depCount: number;
        skillCount: number;
        globalSkillCount: number;
      };
      findings: Finding[];
    };

    expect(parsed.version).toBe("0.1.0");
    expect(parsed.root).toBe("/tmp/my-app");
    expect(parsed.factsSummary).toEqual({
      packageManager: "bun",
      depCount: 3, // next + better-auth + typescript
      skillCount: 1,
      globalSkillCount: 0,
    });
    expect(parsed.findings.map((f) => f.id)).toEqual(["a:err", "z:info"]);
    expect(raw).not.toContain("huge policy");
    expect(raw).toContain("\n"); // pretty
  });

});
