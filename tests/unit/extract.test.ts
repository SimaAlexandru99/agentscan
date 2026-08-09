// tests/unit/extract.test.ts
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { loadConfig } from "../../src/config/load";
import { extractFacts } from "../../src/facts/extract";

const fixture = join(import.meta.dir, "../fixtures/lock-drift");

describe("extractFacts", () => {
  test("reads skills, frontmatter and the lockfile off disk", () => {
    const facts = extractFacts(fixture, loadConfig(fixture));

    const skill = facts.skills.find((s) => s.id === "local-only");
    expect(skill).toBeDefined();
    expect(skill?.hasSkillMd).toBe(true);
    expect(skill?.frontmatterName).toBe("local-only");
    expect(skill?.description).toContain("lockfile does not track");

    expect(facts.hasSkillsLock).toBe(true);
    expect(facts.lockedSkills.map((l) => l.id)).toEqual(["pinned-but-gone"]);
    expect(facts.lockedSkills[0]?.source).toBe("someone/skills");

    // nothing unreadable in this fixture
    expect(facts.configErrors).toEqual([]);
  });
});
