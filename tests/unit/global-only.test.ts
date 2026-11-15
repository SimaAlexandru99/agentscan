import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyze } from "../../src/analyze";
import { main } from "../../src/cli";
import { withHome } from "../helpers/env";
import { tmpProject, write } from "../helpers/tmp";

const BROKEN_HOOK = JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ type: "command", command: "/nowhere/guard.js" }] }] } });

/** A home with a broken user hook, and a project with its own broken hook. */
function fixture() {
  const home = mkdtempSync(join(tmpdir(), "agentscan-home-"));
  write(home, ".claude/settings.json", BROKEN_HOOK);
  const project = tmpProject("agentscan-proj-");
  write(project, ".claude/settings.json", JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ type: "command", command: ".claude/hooks/project-guard.js" }] }] } }));
  return { home, project };
}

test("globalOnly scans the global locations and never the project it is run from", () => {
  const { home, project } = fixture();
  const a = withHome(home, () => analyze({ dir: project, globalOnly: true }));
  const subjects = a.findings.map((f) => f.subject).join("\n");
  expect(subjects).toContain("/nowhere/guard.js");
  expect(subjects).not.toContain("project-guard.js");
  expect(a.config.includeGlobal).toBe(true);
  // The empty virtual root is not reported as unreadable.
  expect(a.findings.some((f) => f.ruleId === "config.unreadable" && f.subject.includes(".agentscan-global-only"))).toBe(false);
});

test("globalOnly treats a home with .claude/ as global config, not as a project", () => {
  const { home } = fixture();
  const a = withHome(home, () => analyze({ dir: home, globalOnly: true }));
  expect(a.facts.skills.every((s) => s.source === "global")).toBe(true);
  expect(a.findings.filter((f) => f.subject.includes("/nowhere/guard.js"))).toHaveLength(1);
});

test("check --global-only prints the same report from any directory", async () => {
  const { home, project } = fixture();
  const chunks: string[] = [];
  const write = process.stdout.write;
  process.stdout.write = ((s: string) => {
    chunks.push(String(s));
    return true;
  }) as typeof process.stdout.write;
  let code: number;
  try {
    code = await withHome(home, () => main(["check", project, "--global-only", "--json"]));
  } finally {
    process.stdout.write = write;
  }
  expect(code).toBe(0);
  const report = JSON.parse(chunks.join("")) as { findings: { subject: string }[] };
  expect(report.findings.some((f) => f.subject.includes("/nowhere/guard.js"))).toBe(true);
  expect(report.findings.some((f) => f.subject.includes("project-guard.js"))).toBe(false);
});
