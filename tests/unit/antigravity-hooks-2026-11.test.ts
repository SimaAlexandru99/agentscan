import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { mkPinnedProject, mkPinnedRoot, write } from "../helpers/tmp";
import { findings, findingsFor, ruleIds } from "../helpers/scan";
import { withHome } from "../helpers/env";

const DOCUMENTED = {
  "my-linter-hook": {
    PostToolUse: [
      {
        matcher: "run_command",
        hooks: [{ type: "command", command: "echo lint", timeout: 10 }],
      },
    ],
  },
  "safety-gate": {
    enabled: false,
    PreToolUse: [
      {
        matcher: "run_command",
        hooks: [{ command: "./scripts/safety-check.sh" }],
      },
    ],
  },
  reminder: {
    PreInvocation: [{ type: "command", command: "echo remind" }],
  },
  "session-init": {
    SessionStart: [{ type: "command", command: "echo init" }],
  },
};

describe("Antigravity hooks.json", () => {
  test("direct handlers are not invalid-group, disabled hooks are skipped, and names are not events", () => {
    const root = mkPinnedProject("agentscan-ag-hooks-");
    write(root, ".agents/hooks.json", JSON.stringify(DOCUMENTED));
    write(
      root,
      ".gemini/settings.json",
      JSON.stringify({
        hooks: { SessionStart: [{ hooks: [{ type: "command", command: "echo gemini" }] }] },
      }),
    );
    const analysis = findingsFor(root);
    const ag = analysis.facts.hooks.filter((hook) => hook.schemaProfile === "antigravity");
    expect(ag.map((hook) => hook.event).sort()).toEqual(["PostToolUse", "PreInvocation", "SessionStart"]);
    expect(ag.every((hook) => hook.defect === undefined)).toBe(true);
    expect(ag.some((hook) => hook.event === "my-linter-hook" || hook.event === "run_command")).toBe(false);
    expect(analysis.facts.hooks.some((hook) => hook.schemaProfile === "gemini" && hook.event === "SessionStart")).toBe(
      true,
    );
    expect(ruleIds(root)).not.toContain("antigravity.hook.unknown-event");
    expect(ruleIds(root)).not.toContain("antigravity.hook.invalid-group");
    expect(ruleIds(root)).not.toContain("antigravity.hook.missing-script");
    expect(ruleIds(root)).not.toContain("antigravity.hook.timeout-out-of-bounds");
  });

  test("a missing type defaults to command, and a non-command type is unknown", () => {
    const root = mkPinnedProject("agentscan-ag-type-");
    write(
      root,
      ".agents/hooks.json",
      JSON.stringify({
        gate: {
          PreToolUse: [
            { hooks: [{ command: "echo bare" }] },
            { hooks: [{ type: "prompt", command: "echo no" }] },
          ],
          Stop: [{ command: "" }],
        },
      }),
    );
    const hooks = findingsFor(root).facts.hooks.filter((hook) => hook.schemaProfile === "antigravity");
    expect(hooks.some((hook) => hook.event === "PreToolUse" && hook.handlerType === "command" && hook.defect === undefined)).toBe(
      true,
    );
    expect(ruleIds(root)).toContain("antigravity.hook.unknown-handler-type");
    expect(ruleIds(root)).toContain("antigravity.hook.command-without-command");
  });

  test("a missing hooks array and a non-string matcher are invalid-group", () => {
    const root = mkPinnedProject("agentscan-ag-group-");
    write(
      root,
      ".agents/hooks.json",
      JSON.stringify({
        gate: {
          PreToolUse: [{ matcher: 1, hooks: [{ command: "echo x" }] }],
          PostToolUse: [{ matcher: "run_command" }],
        },
      }),
    );
    const found = findings(root).filter((item) => item.ruleId === "antigravity.hook.invalid-group");
    expect(found.map((item) => item.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("matcher is not a string"),
        expect.stringContaining("missing a `hooks` array"),
      ]),
    );
  });

  test("a relative command that is not on disk is missing-script", () => {
    const root = mkPinnedProject("agentscan-ag-script-");
    write(
      root,
      ".agents/hooks.json",
      JSON.stringify({
        lint: { PostToolUse: [{ type: "command", command: "./scripts/lint.sh" }] },
      }),
    );
    expect(ruleIds(root)).toContain("antigravity.hook.missing-script");
    expect(ruleIds(root)).not.toContain("antigravity.hook.invalid-group");
  });

  test("an unknown event name is reported, and a non-boolean enabled stays on", () => {
    const root = mkPinnedProject("agentscan-ag-event-");
    write(
      root,
      ".agents/hooks.json",
      JSON.stringify({
        odd: { enabled: "yes", NotAnEvent: [{ command: "echo x" }] },
      }),
    );
    const analysis = findingsFor(root);
    expect(ruleIds(root)).toContain("antigravity.hook.unknown-event");
    expect(analysis.facts.configErrors.some((err) => err.detail === "odd enabled is not a boolean")).toBe(true);
    expect(analysis.facts.hooks.some((hook) => hook.event === "NotAnEvent")).toBe(true);
  });

  test("a parent .agents/hooks.json is opened from a nested start directory", () => {
    const root = mkPinnedProject("agentscan-ag-walk-");
    write(root, ".agents/hooks.json", JSON.stringify(DOCUMENTED));
    write(root, "nested/keep.txt", "x");
    const hooks = findingsFor(root, false, join(root, "nested")).facts.hooks;
    expect(hooks.some((hook) => hook.schemaProfile === "antigravity" && hook.event === "SessionStart")).toBe(true);
  });

  test("user hooks.json stays off unless --global, and the CLI settings file is not a hooks file", () => {
    const root = mkPinnedProject("agentscan-ag-global-");
    const home = mkPinnedRoot("agentscan-ag-home-");
    write(
      home,
      ".gemini/config/hooks.json",
      JSON.stringify({
        boot: { SessionStart: [{ command: "echo global" }] },
      }),
    );
    write(
      home,
      ".gemini/antigravity-cli/settings.json",
      JSON.stringify({
        decoy: { Stop: [{ command: "echo decoy" }] },
      }),
    );
    withHome(home, () => {
      expect(findingsFor(root, false).facts.hooks.some((hook) => hook.schemaProfile === "antigravity")).toBe(false);
      const on = findingsFor(root, true);
      expect(on.facts.hooks.some((hook) => hook.schemaProfile === "antigravity" && hook.event === "SessionStart")).toBe(
        true,
      );
      expect(on.facts.hooks.some((hook) => hook.event === "Stop" && hook.schemaProfile === "antigravity")).toBe(false);
    });
  });
});
