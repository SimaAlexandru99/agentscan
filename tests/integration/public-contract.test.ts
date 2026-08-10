import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { defaultConfig } from "../../src/config/schema";
import { discoverAgentSurface, hookScriptPath, skillReferences } from "../../src/discover/index";
import { runChecks, STRUCTURAL_CHECKS } from "../../src/checks/index";
import type { Facts } from "../../src/facts/types";

const cleanRepo = join(import.meta.dir, "../fixtures/clean-repo");

describe("public discovery and check contracts", () => {
  test("keeps exported helpers and clean fact counts stable", () => {
    expect(skillReferences("Read references/guide.md")).toEqual([
      "references/guide.md",
    ]);
    expect(hookScriptPath("node .claude/hooks/check.mjs")).toBe(
      ".claude/hooks/check.mjs",
    );

    const surface = discoverAgentSurface(cleanRepo, defaultConfig, {
      includeGlobal: false,
    });
    expect(surface.skills).toHaveLength(0);
    expect(surface.agents).toHaveLength(0);
    expect(surface.hooks).toHaveLength(0);
    expect(surface.mcp).toHaveLength(0);
    expect(surface.policyFiles).toHaveLength(0);
    expect(surface.lockedSkills).toHaveLength(0);
    expect(surface.configErrors).toHaveLength(0);
    expect(surface.hasSkillsLock).toBe(false);
  });

  test("keeps declared checks and emitted finding order stable", () => {
    expect(STRUCTURAL_CHECKS.slice(0, 3).map((check) => check.id)).toEqual([
      "config.unreadable",
      "hook.unknown-event",
      "hook.missing-script",
    ]);

    const facts: Facts = {
      root: ".",
      packageManager: "unknown",
      dependencies: {},
      devDependencies: {},
      skills: [],
      agents: [],
      hooks: [{ name: "NotAnEvent", path: "settings.json" }],
      mcp: [],
      policyFiles: [],
      lockedSkills: [],
      hasSkillsLock: false,
      configErrors: [
        { path: "bad.json", kind: "invalid-json", detail: "line 1" },
      ],
    };
    expect(runChecks(facts).map((finding) => finding.ruleId)).toEqual([
      "config.unreadable",
      "hook.unknown-event",
    ]);
  });
});
