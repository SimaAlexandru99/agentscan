// tests/unit/extract.test.ts
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { extractFacts } from "../../src/facts/extract";
import { loadConfig } from "../../src/config/load";

const fixture = join(import.meta.dir, "../fixtures/next16-redundant-skill");

describe("extractFacts", () => {
  test("reads next dep and skill", () => {
    const facts = extractFacts(fixture, loadConfig(fixture));
    expect(facts.dependencies.next).toBe("16.3.0");
    expect(facts.skills.some((s) => s.id === "next-cache-components")).toBe(
      true,
    );
  });
});
