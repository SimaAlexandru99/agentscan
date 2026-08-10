import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultConfig } from "../../src/config/schema";
import { discoverAgentSurface } from "../../src/discover/index";

describe("colliding skill paths", () => {
  test("same skill id in two paths keeps both", () => {
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
    expect(shared).toHaveLength(2);
    expect(new Set(shared.map((skill) => skill.instanceId)).size).toBe(2);
  });

  test("finds nested .claude/skills directories", () => {
    const root = mkdtempSync(join(tmpdir(), "agentscan-nested-"));
    const dir = join(root, "packages", "app", ".claude", "skills", "nested");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), "---\ndescription: nested\n---\n");
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "nested-test" }));
    const surface = discoverAgentSurface(root, defaultConfig, { includeGlobal: false });
    expect(surface.skills.map((skill) => skill.id)).toContain("nested");
  });

  test("does not scan Claude worktree snapshots", () => {
    const root = mkdtempSync(join(tmpdir(), "agentscan-worktree-"));
    const dir = join(root, ".claude", "worktrees", "branch", ".claude", "skills", "snapshot");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), "---\ndescription: snapshot\n---\n");
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "worktree-test" }));
    const surface = discoverAgentSurface(root, defaultConfig, { includeGlobal: false });
    expect(surface.skills.map((skill) => skill.id)).not.toContain("snapshot");
  });
});
