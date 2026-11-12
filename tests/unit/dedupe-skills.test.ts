import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultConfig } from "../../src/config/schema";
import { discoverAgentSurface } from "../../src/discover/index";
import { mkPinnedRoot, scanContext } from "../helpers/tmp";

describe("colliding skill paths", () => {
  test("same skill id in two paths keeps both", () => {
    const root = mkPinnedRoot("agentscan-dedupe-");
    for (const base of [".agents/skills", ".claude/skills"]) {
      const dir = join(root, base, "shared-skill");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "SKILL.md"), "# skill\n");
    }
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "dedupe-test" }),
    );

    const surface = discoverAgentSurface(scanContext(root), defaultConfig);
    const shared = surface.skills.filter((s) => s.id === "shared-skill");
    expect(shared).toHaveLength(2);
    expect(new Set(shared.map((skill) => skill.instanceId)).size).toBe(2);
  });

  test("does not follow a skills directory symlink out of the scan root", () => {
    const root = mkPinnedRoot("agentscan-symlink-skill-");
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "symlink-test" }));
    const outside = mkdtempSync(join(tmpdir(), "agentscan-symlink-outside-"));
    const leaked = join(outside, "leaked");
    mkdirSync(leaked, { recursive: true });
    writeFileSync(join(leaked, "SKILL.md"), "---\ndescription: outside the scan\n---\n");
    mkdirSync(join(root, ".claude", "skills"), { recursive: true });
    symlinkSync(leaked, join(root, ".claude", "skills", "escape"));
    const surface = discoverAgentSurface(scanContext(root, {
      scanBoundary: root,
    }), defaultConfig);
    expect(surface.skills.map((skill) => skill.id)).not.toContain("escape");
    expect(surface.skills.map((skill) => skill.id)).not.toContain("leaked");
  });

  test("finds nested .claude/skills directories", () => {
    const root = mkPinnedRoot("agentscan-nested-");
    const dir = join(root, "packages", "app", ".claude", "skills", "nested");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), "---\ndescription: nested\n---\n");
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "nested-test" }));
    const surface = discoverAgentSurface(scanContext(root), defaultConfig);
    expect(surface.skills.map((skill) => skill.id)).toContain("nested");
  });

  test("does not scan Claude worktree snapshots", () => {
    const root = mkPinnedRoot("agentscan-worktree-");
    const dir = join(root, ".claude", "worktrees", "branch", ".claude", "skills", "snapshot");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), "---\ndescription: snapshot\n---\n");
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "worktree-test" }));
    const surface = discoverAgentSurface(scanContext(root), defaultConfig);
    expect(surface.skills.map((skill) => skill.id)).not.toContain("snapshot");
  });

  test("bounds nested traversal around irrelevant trees", () => {
    const root = mkPinnedRoot("agentscan-bounded-nested-");
    const rootSkill = join(root, ".agents", "skills", "root-skill");
    const nestedSkill = join(root, "packages", "app", ".claude", "skills", "nested-skill");
    mkdirSync(rootSkill, { recursive: true });
    mkdirSync(nestedSkill, { recursive: true });
    writeFileSync(join(rootSkill, "SKILL.md"), "# root\n");
    writeFileSync(join(nestedSkill, "SKILL.md"), "# nested\n");
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "bounded-test" }));

    let baselineReads = 0;
    const baseline = discoverAgentSurface(scanContext(root), defaultConfig, {
      onNestedDirectoryRead: () => baselineReads++,
    });

    for (const ignored of ["vendor", "node_modules", "dist", ".git"]) {
      mkdirSync(join(root, ignored, "package", "deep", ".claude", "skills", "ignored"), {
        recursive: true,
      });
      writeFileSync(
        join(root, ignored, "package", "deep", ".claude", "skills", "ignored", "SKILL.md"),
        "# ignored\n",
      );
    }
    const tooDeep = join(
      root,
      ...Array.from({ length: 10 }, (_, index) => `level-${index}`),
      ".claude",
      "skills",
      "ignored-deep",
    );
    mkdirSync(tooDeep, { recursive: true });
    writeFileSync(join(tooDeep, "SKILL.md"), "# ignored\n");

    let reads = 0;
    const surface = discoverAgentSurface(scanContext(root), defaultConfig, {
      onNestedDirectoryRead: () => reads++,
    });
    expect(surface.skills.map((skill) => skill.id)).toEqual(
      baseline.skills.map((skill) => skill.id),
    );
    expect(reads).toBeGreaterThan(baselineReads);
    expect(reads).toBeLessThanOrEqual(20);
  });
});
