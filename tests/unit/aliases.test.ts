import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mkPinnedProject } from "../helpers/tmp";
import { analyze } from "../../src/analyze";
import { ignoreRuleSet } from "../../src/checks/registry";

describe("retired rule ids", () => {
  test("ignoreRules does not treat a 0.7 id as the canonical id", () => {
    expect(ignoreRuleSet(["hook.unknown-event"]).has("claude.hook.unknown-event")).toBe(
      false,
    );
  });

  test("a project ignoreRules entry with the old id does not hide the new finding", () => {
    const root = mkPinnedProject("agentscan-alias-", "alias");
    mkdirSync(join(root, ".claude"), { recursive: true });
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
    expect(findings.map((f) => f.ruleId)).toContain("claude.hook.unknown-event");
  });
});
