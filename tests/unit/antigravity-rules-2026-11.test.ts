import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuleFact } from "../../src/facts/types";
import { mkPinnedProject, mkPinnedRoot, write } from "../helpers/tmp";
import { findingsFor, ruleIds } from "../helpers/scan";
import { withHome } from "../helpers/env";

function antigravityRules(facts: { rules?: RuleFact[] }): RuleFact[] {
  return (facts.rules ?? []).filter((rule) => rule.sourceProvider === "antigravity");
}

const ALWAYS = "---\ntrigger: always_on\n---\nKeep it short.\n";
const MANUAL = "---\ntrigger: manual\n---\nChecklist.\n";

describe("Antigravity rules and skills", () => {
  test("GEMINI.md is a rule without a trigger check, and AGENTS.md stays policy", () => {
    const root = mkPinnedProject("agentscan-ag-gemini-");
    write(root, "GEMINI.md", "# no frontmatter\n");
    write(root, ".agents/GEMINI.md", "# nested gemini\n");
    write(root, "AGENTS.md", "# portable\n");
    write(root, ".agents/AGENTS.md", "# nested portable\n");
    const facts = findingsFor(root).facts;
    const rules = antigravityRules(facts);
    expect(rules.map((rule) => rule.path).sort()).toEqual(
      [join(root, ".agents", "GEMINI.md"), join(root, "GEMINI.md")].sort(),
    );
    expect(rules.every((rule) => rule.antigravityDefect === undefined)).toBe(true);
    expect(facts.policyFiles.some((file) => file.path === join(root, "AGENTS.md"))).toBe(true);
    expect(facts.policyFiles.some((file) => file.path === join(root, ".agents", "AGENTS.md"))).toBe(true);
    expect((facts.rules ?? []).some((rule) => rule.path.endsWith("AGENTS.md"))).toBe(false);
    expect(ruleIds(root)).not.toContain("antigravity.rule.missing-trigger");
  });

  test("modular trigger, description, and globs defects are one each", () => {
    const root = mkPinnedProject("agentscan-ag-modular-");
    write(root, ".agents/rules/always.md", ALWAYS);
    write(root, ".agents/rules/manual.md", MANUAL);
    write(root, ".agents/rules/plain.md", "# no frontmatter\n");
    write(root, ".agents/rules/bad.md", "---\ntrigger: sometimes\n---\n");
    write(root, ".agents/rules/decide.md", "---\ntrigger: model_decision\n---\n");
    write(root, ".agents/rules/decide-ok.md", "---\ntrigger: model_decision\ndescription: When writing SQL.\n---\n");
    write(root, ".agents/rules/files.md", "---\ntrigger: glob\n---\n");
    write(root, ".agents/rules/files-glob.md", "---\ntrigger: glob\nglob: \"*.ts\"\n---\n");
    write(root, ".agents/rules/files-globs.md", "---\ntrigger: glob\nglobs: \"*.ts, *.tsx\"\n---\n");
    write(root, ".agent/rules/legacy.md", MANUAL);
    write(root, ".agents/rules/.hidden.md", "# hidden\n");
    write(root, ".agents/rules/nested/deep.md", "---\ntrigger: nope\n---\n");
    const ids = ruleIds(root);
    expect(ids).toContain("antigravity.rule.missing-trigger");
    expect(ids).toContain("antigravity.rule.invalid-trigger");
    expect(ids).toContain("antigravity.rule.missing-description");
    expect(ids).toContain("antigravity.rule.missing-globs");
    const rules = antigravityRules(findingsFor(root).facts);
    expect(rules.find((rule) => rule.path.endsWith("/always.md"))?.antigravityDefect).toBeUndefined();
    expect(rules.find((rule) => rule.path.endsWith("/manual.md"))?.antigravityDefect).toBeUndefined();
    expect(rules.find((rule) => rule.path.endsWith("/decide-ok.md"))?.antigravityDefect).toBeUndefined();
    expect(rules.find((rule) => rule.path.endsWith("/files-glob.md"))?.antigravityDefect).toBeUndefined();
    expect(rules.find((rule) => rule.path.endsWith("/files-globs.md"))?.antigravityDefect).toBeUndefined();
    expect(rules.find((rule) => rule.path.endsWith("/legacy.md"))?.antigravityDefect).toBeUndefined();
    expect(rules.some((rule) => rule.path.endsWith(".hidden.md") || rule.path.endsWith("/deep.md"))).toBe(false);
    expect(ids.filter((id) => id === "antigravity.rule.missing-description")).toHaveLength(1);
    expect(ids.filter((id) => id === "antigravity.rule.missing-globs")).toHaveLength(1);
  });

  test("bad YAML is a config error and not a missing trigger", () => {
    const root = mkPinnedProject("agentscan-ag-yaml-");
    write(root, ".agents/rules/broken.md", "---\ntrigger: [\n---\n");
    const analysis = findingsFor(root);
    expect(
      analysis.facts.configErrors.some(
        (err) => err.path.endsWith("/broken.md") && err.detail === "Antigravity rule frontmatter is not valid YAML",
      ),
    ).toBe(true);
    expect(ruleIds(root)).not.toContain("antigravity.rule.missing-trigger");
    expect(ruleIds(root)).not.toContain("antigravity.rule.invalid-trigger");
  });

  test("24,000 bytes is inside the limit and 24,001 is not, and a defect can share the file", () => {
    const root = mkPinnedProject("agentscan-ag-bytes-");
    write(root, "GEMINI.md", "x".repeat(24_000));
    write(root, ".agents/rules/big.md", "y".repeat(24_001));
    const ids = ruleIds(root);
    const rules = antigravityRules(findingsFor(root).facts);
    expect(rules.find((rule) => rule.path.endsWith("GEMINI.md"))?.byteLength).toBe(24_000);
    expect(ids.filter((id) => id === "antigravity.rule.too-large")).toEqual(["antigravity.rule.too-large"]);
    expect(ids).toContain("antigravity.rule.missing-trigger");
    const big = findingsFor(root).findings.filter((finding) => finding.ruleId === "antigravity.rule.too-large");
    expect(big).toHaveLength(1);
    expect(big[0]!.message).toContain("24001");
    expect(big[0]!.severity).toBe("warning");
  });

  test("a child rules dir is unread from the workspace, and a parent rule is read from a nested start", () => {
    const root = mkPinnedProject("agentscan-ag-walk-");
    write(root, "GEMINI.md", "# parent\n");
    write(root, "child/.agents/rules/below.md", "---\ntrigger: sometimes\n---\n");
    write(root, "child/deeper/keep.txt", "x");
    const fromRoot = antigravityRules(findingsFor(root).facts);
    expect(fromRoot.map((rule) => rule.path)).toEqual([join(root, "GEMINI.md")]);
    expect(ruleIds(root)).not.toContain("antigravity.rule.invalid-trigger");
    const fromChild = antigravityRules(findingsFor(root, false, join(root, "child")).facts);
    expect(fromChild.some((rule) => rule.path === join(root, "GEMINI.md"))).toBe(true);
    expect(fromChild.some((rule) => rule.path.endsWith("/below.md"))).toBe(true);
    const fromDeeper = antigravityRules(findingsFor(root, false, join(root, "child", "deeper")).facts);
    expect(fromDeeper.some((rule) => rule.path.endsWith("/below.md"))).toBe(true);
    expect(fromDeeper.some((rule) => rule.path === join(root, "GEMINI.md"))).toBe(true);
  });

  test("rules.json records a bad root or entries and does not follow paths", () => {
    const root = mkPinnedProject("agentscan-ag-rules-json-");
    const outside = mkdtempSync(join(tmpdir(), "agentscan-ag-outside-"));
    write(outside, "leaked.md", "---\ntrigger: sometimes\n---\n");
    write(
      root,
      ".agents/rules.json",
      JSON.stringify({
        inherits: [{ path: outside }],
        entries: [{ path: join(outside, "leaked.md") }],
      }),
    );
    const followed = findingsFor(root);
    expect(followed.facts.configErrors.some((err) => err.path.endsWith("rules.json"))).toBe(false);
    expect((followed.facts.rules ?? []).some((rule) => rule.path.startsWith(outside))).toBe(false);
    expect(ruleIds(root)).not.toContain("antigravity.rule.invalid-trigger");

    const bad = mkPinnedProject("agentscan-ag-rules-json-bad-");
    write(bad, ".agents/rules.json", JSON.stringify({ inherits: [{ path: outside }], entries: "nope" }));
    const analysis = findingsFor(bad);
    const errors = analysis.facts.configErrors.filter((err) => err.path.endsWith("rules.json"));
    expect(errors.map((err) => err.detail)).toEqual(["`entries` is not an array"]);
    expect((analysis.facts.rules ?? []).some((rule) => rule.path.startsWith(outside))).toBe(false);

    const arrayRoot = mkPinnedProject("agentscan-ag-rules-json-array-");
    write(arrayRoot, ".agents/rules.json", "[]");
    const rootErrors = findingsFor(arrayRoot).facts.configErrors.filter((err) => err.path.endsWith("rules.json"));
    expect(rootErrors.map((err) => err.detail)).toEqual(["Antigravity rules.json root is not an object"]);
  });

  test("project .agents/skills stays one Agent Skills fact", () => {
    const root = mkPinnedProject("agentscan-ag-skill-project-");
    write(root, ".agents/skills/review/SKILL.md", "---\nname: review\ndescription: Review the change.\n---\n");
    const skills = findingsFor(root).facts.skills.filter((skill) => skill.id === "review");
    expect(skills).toHaveLength(1);
    expect(skills[0]!.sourceProvider).toBe("agent-skills");
    expect(skills[0]!.schemaProfile).toBe("agent-skills");
    expect(skills[0]!.source).toBe("project");
  });

  test("global rules and skills stay off unless --global, and legacy skill dirs stay unread", () => {
    const root = mkPinnedProject("agentscan-ag-global-rules-");
    const home = mkPinnedRoot("agentscan-ag-rules-home-");
    write(home, ".gemini/GEMINI.md", "# gemini home\n");
    write(home, ".gemini/AGENTS.md", "# gemini agents\n");
    write(home, ".gemini/config/GEMINI.md", "# config gemini\n");
    write(home, ".gemini/config/AGENTS.md", "# config agents\n");
    write(home, ".gemini/config/rules/always.md", ALWAYS);
    write(
      home,
      ".gemini/config/skills/global-review/SKILL.md",
      "---\nname: global-review\ndescription: Review from home.\n---\n",
    );
    write(home, ".gemini/skills/decoy/SKILL.md", "---\nname: decoy\ndescription: Unread.\n---\n");
    write(
      home,
      ".gemini/antigravity-cli/skills/cli-legacy/SKILL.md",
      "---\nname: cli-legacy\ndescription: Unread.\n---\n",
    );
    write(
      home,
      ".gemini/antigravity/skills/ide-legacy/SKILL.md",
      "---\nname: ide-legacy\ndescription: Unread.\n---\n",
    );
    write(
      home,
      ".gemini/config/plugins/plug/skills/plugin-skill/SKILL.md",
      "---\nname: plugin-skill\ndescription: Unread.\n---\n",
    );
    withHome(home, () => {
      const off = findingsFor(root, false);
      expect(antigravityRules(off.facts)).toEqual([]);
      expect(off.facts.skills.some((skill) => skill.id === "global-review")).toBe(false);
      const on = findingsFor(root, true);
      const rules = antigravityRules(on.facts);
      expect(rules.map((rule) => rule.path).sort()).toEqual(
        [
          join(home, ".gemini", "GEMINI.md"),
          join(home, ".gemini", "AGENTS.md"),
          join(home, ".gemini", "config", "GEMINI.md"),
          join(home, ".gemini", "config", "AGENTS.md"),
          join(home, ".gemini", "config", "rules", "always.md"),
        ].sort(),
      );
      expect(rules.every((rule) => rule.antigravityDefect === undefined)).toBe(true);
      expect(on.facts.policyFiles.some((file) => file.path.endsWith(`${join(".gemini", "AGENTS.md")}`))).toBe(false);
      const skill = on.facts.skills.find((item) => item.id === "global-review");
      expect(skill?.source).toBe("global");
      expect(skill?.sourceProvider).toBe("antigravity");
      expect(skill?.schemaProfile).toBe("agent-skills");
      const unread = ["decoy", "cli-legacy", "ide-legacy", "plugin-skill"];
      expect(on.facts.skills.some((item) => unread.includes(item.id))).toBe(false);
    });
  });
});

describe("Antigravity skill name", () => {
  test("a global Antigravity skill without name defaults to its folder", () => {
    const root = mkPinnedProject("agentscan-ag-noname-");
    const home = mkPinnedRoot("agentscan-ag-noname-home-");
    write(home, ".gemini/config/skills/no-name/SKILL.md", "---\ndescription: Folder is the name.\n---\n");
    withHome(home, () => {
      const ids = ruleIds(root, true);
      expect(ids).not.toContain("agent-skills.skill.missing-name");
      expect(ids).not.toContain("agent-skills.skill.name-does-not-match-directory");
    });
    // The workspace Agent Skills provider still requires name.
    write(root, ".agents/skills/no-name/SKILL.md", "---\ndescription: Needs a name.\n---\n");
    expect(ruleIds(root)).toContain("agent-skills.skill.missing-name");
  });
});

describe("Gemini CLI GEMINI.md", () => {
  test("GEMINI.md is read in the start dir and each ancestor up to the scan root", () => {
    const root = mkPinnedProject("agentscan-gemini-ancestors-");
    const start = join(root, "packages", "app");
    write(root, "GEMINI.md", "# root\n");
    write(root, "packages/GEMINI.md", "# packages\n");
    write(root, "packages/app/GEMINI.md", "# app\n");
    const paths = antigravityRules(findingsFor(root, false, start).facts).map((rule) => rule.path);
    expect(paths.sort()).toEqual(
      [join(root, "GEMINI.md"), join(root, "packages", "GEMINI.md"), join(start, "GEMINI.md")].sort(),
    );
  });
});
