import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyze } from "../../src/analyze";

function tmpProject(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  writeFileSync(join(root, "package.json"), '{"name":"lock-mono"}', "utf8");
  return root;
}

function write(root: string, rel: string, body: string): void {
  const abs = join(root, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, body, "utf8");
}

describe("skills-lock ownership in a monorepo", () => {
  test("each skill is compared only to the lockfile that governs its root", () => {
    const root = tmpProject("agentscan-lock-mono-");
    write(
      root,
      "skills-lock.json",
      JSON.stringify({ skills: { "root-skill": { source: "root/skills" } } }),
    );
    write(
      root,
      ".claude/skills/root-skill/SKILL.md",
      "---\nname: root-skill\ndescription: Root skill.\n---\n",
    );
    write(
      root,
      "packages/app/skills-lock.json",
      JSON.stringify({ skills: { "app-skill": { source: "app/skills" } } }),
    );
    write(
      root,
      "packages/app/.claude/skills/app-skill/SKILL.md",
      "---\nname: app-skill\ndescription: App skill.\n---\n",
    );
    write(
      root,
      "packages/app/.claude/skills/app-local/SKILL.md",
      "---\nname: app-local\ndescription: App local skill.\n---\n",
    );

    const analysis = analyze({ dir: root });
    const lockFindings = analysis.findings.filter(
      (finding) =>
        finding.ruleId === "skill.not-in-lock" || finding.ruleId === "skill.locked-not-installed",
    );
    expect(lockFindings.map((finding) => `${finding.ruleId}:${finding.subject}`).sort()).toEqual([
      "skill.not-in-lock:skill:app-local",
    ]);
  });
});
