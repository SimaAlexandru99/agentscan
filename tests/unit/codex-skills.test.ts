import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanContext, tmpProject, write } from "../helpers/tmp";
import { analyze } from "../../src/analyze";
import { defaultConfig } from "../../src/config/schema";
import { extractFacts } from "../../src/discover/extract";
import { ruleIds } from "../helpers/scan";
import { withEnv } from "../helpers/env";

describe("Codex skills live in .agents/skills (developers.openai.com/codex/skills, 2026-11-14)", () => {
  test("project .agents/skills is checked as Agent Skills", () => {
    const root = tmpProject("agentscan-codex-skill-name-");
    write(root, ".agents/skills/review/SKILL.md", "---\ndescription: Review the change.\n---\n");
    const facts = extractFacts(scanContext(root), defaultConfig);
    expect(facts.skills[0]!.schemaProfile).toBe("agent-skills");
    expect(ruleIds(root)).toContain("agent-skills.skill.missing-name");
  });

  test("missing description is an error", () => {
    const root = tmpProject("agentscan-codex-skill-desc-");
    write(root, ".agents/skills/review/SKILL.md", "---\nname: review\n---\n");
    const finding = analyze({ dir: root }).findings.find(
      (item) => item.ruleId === "agent-skills.skill.missing-description",
    );
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe("error");
  });

  test(".codex/skills is not a documented Codex skills location", () => {
    const root = tmpProject("agentscan-codex-skill-undoc-");
    write(root, ".codex/skills/review/SKILL.md", "---\nname: review\ndescription: Review the change.\n---\n");
    const facts = extractFacts(scanContext(root), defaultConfig);
    expect(facts.skills.filter((s) => s.sourceProvider === "codex")).toEqual([]);
  });

  test("CODEX_HOME/skills is not read as user skills; AGENTS.md still is under --global", () => {
    const root = tmpProject("agentscan-codex-home-env-");
    const codexHome = mkdtempSync(join(tmpdir(), "agentscan-codex-althome-"));
    write(codexHome, "skills/x/SKILL.md", "---\nname: x\ndescription: From CODEX_HOME.\n---\n");
    write(codexHome, "AGENTS.md", "# codex home\n");
    withEnv({ CODEX_HOME: codexHome }, () => {
      const facts = extractFacts(scanContext(root), { ...defaultConfig, includeGlobal: true });
      expect(facts.skills.some((s) => s.path === join(codexHome, "skills", "x"))).toBe(false);
      expect(facts.policyFiles.some((f) => f.path === join(codexHome, "AGENTS.md"))).toBe(true);
    });
  });
});
