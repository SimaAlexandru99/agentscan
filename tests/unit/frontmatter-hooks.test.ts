import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runChecks } from "../../src/checks/index";
import { defaultConfig } from "../../src/config/schema";
import { extractFacts } from "../../src/facts/extract";

/**
 * A skill or subagent may declare hooks in its frontmatter, "in the same
 * configuration format as settings-based hooks". None of the 798 SKILL.md and
 * agent files measured on this machine do, so these fixtures are the only
 * coverage this surface has — the shape is taken from the reference example
 * verbatim. See docs/spec/hook-sources.md.
 */
const frontmatter = (command: string) =>
  `---
name: secure-operations
description: Perform operations with security checks
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "${command}"
---

Body.
`;

function project(): string {
  const root = mkdtempSync(join(tmpdir(), "agentscan-fm-hooks-"));
  writeFileSync(join(root, "package.json"), "{}");
  return root;
}

function skill(root: string, name: string, command: string): string {
  const dir = join(root, ".claude", "skills", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), frontmatter(command));
  return dir;
}

function agent(root: string, name: string, command: string): void {
  const dir = join(root, ".claude", "agents");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.md`), frontmatter(command));
}

function hookFindings(root: string) {
  return runChecks(
    extractFacts(root, defaultConfig, { includeGlobal: false }),
  ).filter((f) => f.ruleId === "hook.missing-script");
}

describe("hooks declared in skill frontmatter", () => {
  test("a script missing from both bases is reported", () => {
    const root = project();
    skill(root, "secure-ops", "./scripts/security-check.sh");
    expect(hookFindings(root)).toHaveLength(1);
  });

  test("a script in the skill's own directory is silent", () => {
    const root = project();
    const dir = skill(root, "secure-ops", "./scripts/security-check.sh");
    mkdirSync(join(dir, "scripts"), { recursive: true });
    writeFileSync(join(dir, "scripts", "security-check.sh"), "exit 0\n");
    expect(hookFindings(root)).toEqual([]);
  });

  test("a script at the project root is silent too", () => {
    // Two bases, because the docs give a relative path no stated base: the
    // placeholders exist precisely because the working directory is not fixed.
    const root = project();
    skill(root, "secure-ops", "./scripts/security-check.sh");
    mkdirSync(join(root, "scripts"), { recursive: true });
    writeFileSync(join(root, "scripts", "security-check.sh"), "exit 0\n");
    expect(hookFindings(root)).toEqual([]);
  });

  test("the finding names the SKILL.md that declared it", () => {
    const root = project();
    skill(root, "secure-ops", "./scripts/gone.sh");
    const [finding] = hookFindings(root);
    expect(
      finding?.evidence.some((e) => e.value.includes("SKILL.md")),
    ).toBe(true);
  });
});

describe("hooks declared in subagent frontmatter", () => {
  test("a missing script is reported against the agent file", () => {
    const root = project();
    agent(root, "reviewer", "./scripts/validation.sh");
    const [finding] = hookFindings(root);
    expect(finding).toBeDefined();
    expect(
      finding?.evidence.some((e) => e.value.includes("reviewer.md")),
    ).toBe(true);
  });

  test("a script beside the agent file is silent", () => {
    const root = project();
    agent(root, "reviewer", "./scripts/validation.sh");
    mkdirSync(join(root, ".claude", "agents", "scripts"), { recursive: true });
    writeFileSync(
      join(root, ".claude", "agents", "scripts", "validation.sh"),
      "exit 0\n",
    );
    expect(hookFindings(root)).toEqual([]);
  });

  test("an unknown event in frontmatter is reported like any other", () => {
    const root = project();
    const dir = join(root, ".claude", "agents");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "typo.md"),
      `---
name: typo
description: d
hooks:
  PreToolUseX:
    - hooks:
        - type: command
          command: "echo hi"
---
`,
    );
    const findings = runChecks(
      extractFacts(root, defaultConfig, { includeGlobal: false }),
    );
    expect(
      findings.filter((f) => f.ruleId === "hook.unknown-event"),
    ).toHaveLength(1);
  });
});
