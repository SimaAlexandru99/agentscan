import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mkPinnedProject } from "../helpers/tmp";
import { analyze } from "../../src/analyze";
import { defaultConfig } from "../../src/config/schema";
import { extractFacts } from "../../src/facts/extract";
import { providerFromSkillsDir, schemaProfileFromSkillsDir } from "../../src/facts/provider";

function tmpProject(prefix: string): string {
  return mkPinnedProject(prefix, "codex-skills");
}

function write(root: string, rel: string, body: string): void {
  const abs = join(root, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, body, "utf8");
}

function ruleIds(dir: string): string[] {
  return analyze({ dir }).findings.map((finding) => finding.ruleId);
}

describe("Codex skills are Agent Skills", () => {
  test("missing name -> agent-skills.skill.missing-name", () => {
    const root = tmpProject("agentscan-codex-skill-name-");
    write(root, ".codex/skills/review/SKILL.md", "---\ndescription: Review the change.\n---\n");
    const facts = extractFacts(root, defaultConfig, { includeGlobal: false });
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
    expect(providerFromSkillsDir("/home/u/.codex/skills")).toBe("codex");
    expect(schemaProfileFromSkillsDir("/home/u/.codex/skills")).toBe("agent-skills");
  });
});
