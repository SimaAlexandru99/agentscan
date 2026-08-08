// tests/unit/orphan-summary.test.ts
import { describe, expect, test } from "bun:test";
import type { Finding } from "../../src/facts/types";
import {
  buildOrphanSummary,
  skillFamily,
} from "../../src/report/orphan-summary";

function orphan(subject: string, id = subject): Finding {
  return {
    id: `skill.orphan:${id}`,
    ruleId: "skill.orphan",
    action: "warn",
    severity: "info",
    subject,
    message: "Orphan skill",
    reason: "test",
    evidence: [],
  };
}

describe("skillFamily", () => {
  test("strips skill: and takes prefix before first hyphen", () => {
    expect(skillFamily("skill:firebase-auth-basics")).toBe("firebase");
    expect(skillFamily("tanstack-query")).toBe("tanstack");
    expect(skillFamily("zod")).toBe("zod");
  });
});

describe("buildOrphanSummary", () => {
  test("returns null when no orphans", () => {
    const other: Finding = {
      id: "x:skill:y",
      ruleId: "next.redundant-cache-components-skill",
      action: "delete",
      severity: "warning",
      subject: "skill:next-cache-components",
      message: "x",
      reason: "y",
      evidence: [],
    };
    expect(buildOrphanSummary([other])).toBeNull();
    expect(buildOrphanSummary([])).toBeNull();
  });

  test("one line with count and top families", () => {
    const findings = [
      orphan("skill:firebase-a"),
      orphan("skill:firebase-b"),
      orphan("skill:tanstack-x"),
      orphan("skill:design-taste"),
      orphan("skill:gsap-core"),
    ];
    const line = buildOrphanSummary(findings);
    expect(line).toBe(
      "ORPHAN  5 skills · top: firebase (2), design (1), gsap (1) · --verbose for list",
    );
    // top 3 only — tanstack and design/gsap tie at 1: name asc → design, gsap (tanstack dropped)
  });

  test("ignores non-orphan findings in input", () => {
    const findings = [
      orphan("skill:foo-bar"),
      {
        id: "a:b",
        ruleId: "other",
        action: "add" as const,
        severity: "warning" as const,
        subject: "skill:better-auth",
        message: "m",
        reason: "r",
        evidence: [],
      },
    ];
    expect(buildOrphanSummary(findings)).toBe(
      "ORPHAN  1 skills · top: foo (1) · --verbose for list",
    );
  });
});
