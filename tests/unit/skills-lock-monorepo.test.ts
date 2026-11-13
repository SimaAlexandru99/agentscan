import { describe, expect, test } from "bun:test";
import { tmpProject, write } from "../helpers/tmp";
import { analyze } from "../../src/analyze";

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

describe("skills-lock inside a dot-dir worktree", () => {
  test("entries installed beside the lock are not reported as missing", () => {
    const root = tmpProject("agentscan-lock-worktree-");
    write(
      root,
      ".worktrees/x/skills-lock.json",
      JSON.stringify({ skills: { present: {}, absent: {} } }),
    );
    write(
      root,
      ".worktrees/x/.claude/skills/present/SKILL.md",
      "---\nname: present\ndescription: Present skill.\n---\n",
    );

    const missing = analyze({ dir: root })
      .findings.filter((finding) => finding.ruleId === "skill.locked-not-installed")
      .map((finding) => finding.subject);
    expect(missing.some((subject) => subject.includes("present"))).toBe(false);
    expect(missing.some((subject) => subject.includes("absent"))).toBe(true);
  });
});
