import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultConfig } from "../../src/config/schema";
import { discoverAgentSurface } from "../../src/discover/index";

describe("dedupeSkillsById", () => {
  test("same skill id in two paths keeps one", () => {
    const root = mkdtempSync(join(tmpdir(), "agentscan-dedupe-"));
    for (const base of [".agents/skills", ".claude/skills"]) {
      const dir = join(root, base, "shared-skill");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "SKILL.md"), "# skill\n");
    }
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "dedupe-test" }),
    );

    const surface = discoverAgentSurface(root, defaultConfig, {
      includeGlobal: false,
    });
    const shared = surface.skills.filter((s) => s.id === "shared-skill");
    expect(shared).toHaveLength(1);
    // first skillPaths entry wins (.agents/skills)
    expect(shared[0]?.path).toContain(".agents");
  });
});
