import { describe, expect, test } from "bun:test";
import type { Finding, Severity } from "../../src/findings";
import { score } from "../../src/report/score";
import { ruleMeta } from "../helpers/finding";

const f = (severity: Severity): Finding => ({
  id: `${severity}-${Math.random()}`,
  ruleId: "r",
  action: "warn",
  severity,
  subject: "s",
  message: "m",
  reason: "r",
  ...ruleMeta("r"),
  evidence: [],
});

const many = (severity: Severity, n: number): Finding[] =>
  Array.from({ length: n }, () => f(severity));

describe("score", () => {
  test("nothing found is 100", () => {
    expect(score([])).toBe(100);
  });

  test("info never costs anything", () => {
    // info is advisory — budgets and hygiene. Charging for it would make a
    // large healthy config score worse than a small broken one.
    expect(score(many("info", 20))).toBe(100);
  });

  test("it floors at zero rather than going negative", () => {
    expect(score(many("error", 50))).toBe(0);
  });

  test("a warning costs something, and an error costs more", () => {
    expect(score([f("warning")])).toBeLessThan(100);
    expect(score([f("error")])).toBeLessThan(score(many("warning", 2)));
  });
});
