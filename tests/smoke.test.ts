import { describe, expect, test } from "bun:test";
import pkg from "../package.json";
import { VERSION } from "../src/version";

describe("scaffold", () => {
  // VERSION is stamped into --version and into every JSON report, so a release
  // that bumps package.json alone ships a report claiming the old version.
  test("VERSION agrees with package.json", () => {
    expect(VERSION).toBe(pkg.version);
  });
});
