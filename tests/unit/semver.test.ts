import { describe, expect, test } from "bun:test";
import { coerceVersion, gte, lt } from "../../src/facts/semver";

describe("semver", () => {
  test("coerceVersion strips caret", () => {
    expect(coerceVersion("^16.3.0")).toBe("16.3.0");
    expect(coerceVersion("~1.2.3")).toBe("1.2.3");
  });

  test("gte works on major", () => {
    expect(gte("16.3.0", "16.0.0")).toBe(true);
    expect(gte("15.9.0", "16.0.0")).toBe(false);
  });

  test("lt works", () => {
    expect(lt("15.0.0", "16.0.0")).toBe(true);
  });
});
