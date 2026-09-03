import { describe, expect, test } from "bun:test";
import type { Finding, Severity } from "../../src/facts/types";
import { ERROR_COST, WARNING_COST, score } from "../../src/report/score";
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

  test("each severity costs its published weight", () => {
    expect(score([f("error")])).toBe(100 - ERROR_COST);
    expect(score([f("warning")])).toBe(100 - WARNING_COST);
  });

  test("info never costs anything", () => {
    // info is advisory — budgets and hygiene. Charging for it would make a
    // large healthy config score worse than a small broken one.
    expect(score(many("info", 20))).toBe(100);
  });

  test("it floors at zero rather than going negative", () => {
    expect(score(many("error", 50))).toBe(0);
  });

  test("it does not scale with project size", () => {
    // the same two errors, in a project with twenty extra info findings
    const small = score(many("error", 2));
    const large = score([...many("error", 2), ...many("info", 20)]);
    expect(large).toBe(small);
  });

  test("errors outrank warnings", () => {
    expect(score([f("error")])).toBeLessThan(score(many("warning", 2)));
  });

  test("the arithmetic is reproducible by hand from the report", () => {
    // 6 errors and 0 warnings — touchagency's real shape
    expect(score(many("error", 6))).toBe(100 - 6 * ERROR_COST);
  });
});
