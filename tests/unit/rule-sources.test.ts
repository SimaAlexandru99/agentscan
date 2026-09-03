import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { STRUCTURAL_CHECKS } from "../../src/checks/index";
import { SPEC_SURFACES } from "../../scripts/spec-surfaces";

const SPEC_DIR = join(import.meta.dir, "../../docs/spec");

const specRules = STRUCTURAL_CHECKS.flatMap((check) =>
  check.source.kind === "spec" ? [{ check, source: check.source }] : [],
);
const derivedRules = STRUCTURAL_CHECKS.filter((check) => check.source.kind === "derived");

function capture(file: string): string {
  return readFileSync(join(SPEC_DIR, file), "utf8");
}

/**
 * The contract that makes a printed source worth reading.
 *
 * A URL on a finding is only as good as the promise behind it: that the page
 * is watched, that a capture holds the quoted lines, and that the date is not
 * stale prose. Each assertion below is one half of that promise.
 */
describe("every rule can say where it came from", () => {
  test("all 112 rules declare a source", () => {
    expect(specRules.length + derivedRules.length).toBe(STRUCTURAL_CHECKS.length);
  });

  test("every cited page is one spec:check watches for drift", () => {
    // This is the whole argument for showing a URL to a user: the page behind
    // it is re-fetched and hash-compared weekly, so a vendor changing it fails
    // CI instead of silently turning a quoted rule into a false positive.
    const watched = new Set(SPEC_SURFACES.map((surface) => surface.url));
    const unwatched = specRules
      .filter(({ source }) => !watched.has(source.url))
      .map(({ check, source }) => `${check.id} -> ${source.url}`);
    expect(unwatched).toEqual([]);
  });

  test("every capture file exists", () => {
    const missing = specRules
      .filter(({ source }) => !existsSync(join(SPEC_DIR, source.capture)))
      .map(({ check, source }) => `${check.id} -> docs/spec/${source.capture}`);
    expect(missing).toEqual([]);
  });

  test("the capture agrees the rule rests on it", () => {
    // Catches a rule pointed at a plausible but wrong capture — the failure a
    // URL string alone cannot detect.
    const orphans = specRules
      .filter(({ check, source }) => {
        const text = capture(source.capture);
        const prefix = `${check.id.split(".").slice(0, -1).join(".")}.*`;
        return !text.includes(check.id) && !text.includes(prefix);
      })
      .map(({ check, source }) => `${check.id} not named in docs/spec/${source.capture}`);
    expect(orphans).toEqual([]);
  });

  test("lastVerified matches the capture's Read date", () => {
    // One date, not two. These drifted apart once already: 54 rules claimed
    // 2026-09-02 while their captures had been re-read on 2026-09-03.
    const stale = specRules
      .filter(({ check, source }) => {
        const read = /^\*\*Read:\*\*\s*(\d{4}-\d{2}-\d{2})/m.exec(capture(source.capture));
        return read?.[1] !== check.lastVerified;
      })
      .map(({ check, source }) => `${check.id}: registry ${check.lastVerified} vs ${source.capture}`);
    expect(stale).toEqual([]);
  });

  test("a spec-required rule may not claim it has no source", () => {
    const wrong = derivedRules
      .filter((check) => check.provenance === "spec-required")
      .map((check) => check.id);
    expect(wrong).toEqual([]);
  });

  test("every cited URL is absolute https", () => {
    const bad = specRules
      .filter(({ source }) => !source.url.startsWith("https://"))
      .map(({ check, source }) => `${check.id} -> ${source.url}`);
    expect(bad).toEqual([]);
  });
});
