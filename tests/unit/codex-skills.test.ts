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

describe("Codex skills are Agent Skills", () => {
  test("missing name -> agent-skills.skill.missing-name", () => {
    const root = tmpProject("agentscan-codex-skill-name-");
    write(root, ".codex/skills/review/SKILL.md", "---\ndescription: Review the change.\n---\n");
    const facts = extractFacts(scanContext(root), defaultConfig);
    expect(facts.skills[0]!.sourceProvider).toBe("codex");
    expect(facts.skills[0]!.schemaProfile).toBe("agent-skills");
    expect(ruleIds(root)).toContain("agent-skills.skill.missing-name");
  });

  test("missing description is an error", () => {
    const root = tmpProject("agentscan-codex-skill-desc-");
    write(root, ".codex/skills/review/SKILL.md", "---\nname: review\n---\n");
    const finding = analyze({ dir: root }).findings.find(
      (item) => item.ruleId === "agent-skills.skill.missing-description",
    );
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe("error");
  });

  test("valid Codex Agent Skill passes the Agent Skills rules", () => {
    const root = tmpProject("agentscan-codex-skill-ok-");
    write(
      root,
      ".codex/skills/review/SKILL.md",
      "---\nname: review\ndescription: Review the change.\n---\n",
    );
    const ids = ruleIds(root);
    expect(ids.filter((id) => id.startsWith("agent-skills."))).toEqual([]);
    expect(analyze({ dir: root }).facts.skills[0]!.sourceProvider).toBe("codex");
  });

  test("CODEX_HOME relocates user skills and AGENTS.md under --global", () => {
    const root = tmpProject("agentscan-codex-home-env-");
    const codexHome = mkdtempSync(join(tmpdir(), "agentscan-codex-althome-"));
    write(codexHome, "skills/x/SKILL.md", "---\nname: x\ndescription: From CODEX_HOME.\n---\n");
    write(codexHome, "AGENTS.md", "# codex home\n");
    withEnv({ CODEX_HOME: codexHome }, () => {
      const facts = extractFacts(scanContext(root), { ...defaultConfig, includeGlobal: true });
      const skill = facts.skills.find((s) => s.path === join(codexHome, "skills", "x"));
      expect(skill?.source).toBe("global");
      expect(skill?.sourceProvider).toBe("codex");
      expect(skill?.schemaProfile).toBe("agent-skills");
      expect(facts.policyFiles.some((f) => f.path === join(codexHome, "AGENTS.md"))).toBe(true);
    });
  });
});
