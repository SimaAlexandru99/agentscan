import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyze } from "../../src/analyze";
import { ignoreRuleSet } from "../../src/checks/aliases";

describe("rule aliases", () => {
  test("ignoreRules accepts pre-0.8 ids", () => {
    expect(ignoreRuleSet(["hook.unknown-event"]).has("claude.hook.unknown-event")).toBe(
      true,
    );
  });

  test("a project ignoreRules entry with the old id hides the new finding", () => {
    const root = mkdtempSync(join(tmpdir(), "agentscan-alias-"));
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(join(root, "package.json"), '{"name":"alias"}', "utf8");
    writeFileSync(
      join(root, ".claude", "settings.json"),
      JSON.stringify({ hooks: { Nope: [{ hooks: [{ type: "command", command: "true" }] }] } }),
      "utf8",
    );
    writeFileSync(
      join(root, ".agentscanrc.json"),
      JSON.stringify({ ignoreRules: ["hook.unknown-event"] }),
      "utf8",
    );
    const { findings } = analyze({ dir: root });
    expect(findings.map((f) => f.ruleId)).not.toContain("claude.hook.unknown-event");
  });
});
