import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runChecks } from "../../src/checks/index";
import { defaultConfig } from "../../src/config/schema";
import { extractFacts } from "../../src/facts/extract";

/**
 * A SKILL.md past the 64 KB scan cap used to be reported as `config.unreadable`
 * at severity error — "its contents are invisible to the scan", "whatever it
 * configured is simply not in effect". Both are false: Claude Code loads the
 * file, and the frontmatter sits in the first 300 bytes. Four such files cost a
 * real project 40 of its 100 points.
 *
 * `~/projects/touchagency/.claude/skills/hallmark/SKILL.md` is the file this
 * came from: 67,444 bytes, 1.9 KB over the cap, valid frontmatter on line 2.
 */
function projectWithOversizedSkill(): string {
  const root = mkdtempSync(join(tmpdir(), "agentscan-cap-"));
  const skillDir = join(root, ".claude", "skills", "hallmark");
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(root, "package.json"), "{}");
  writeFileSync(
    join(skillDir, "SKILL.md"),
    `---\nname: hallmark\ndescription: Anti-slop design skill\n---\n\n${"body text. ".repeat(7000)}`,
  );
  return root;
}

function findingsFor(root: string) {
  return runChecks(extractFacts(root, defaultConfig, { includeGlobal: false }));
}

describe("a file past the scan cap", () => {
  const findings = findingsFor(projectWithOversizedSkill());

  test("is not reported as unreadable config", () => {
    expect(findings.filter((f) => f.ruleId === "config.unreadable")).toEqual([]);
  });

  test("is reported once, at info, as a partial read", () => {
    const truncated = findings.filter((f) => f.ruleId === "scan.truncated");
    expect(truncated).toHaveLength(1);
    expect(truncated[0]!.severity).toBe("info");
    expect(truncated[0]!.message).toContain("SKILL.md");
  });

  test("still has its frontmatter read", () => {
    // The whole point: a description parsed from the first 300 bytes means the
    // skill is not treated as broken, so no structural check fires on it.
    expect(findings.filter((f) => f.ruleId.startsWith("skill."))).toEqual([]);
  });
});
