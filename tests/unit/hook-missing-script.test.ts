import { describe, expect, test } from "bun:test";
import { findingsFor } from "../helpers/scan";
import { tmpProject, write } from "../helpers/tmp";

/**
 * A hook whose script does not exist never runs. Each provider reports it under
 * its own rule id, and only that one: a Copilot hook must not also read as a
 * VS Code or Claude finding.
 */
const cases: { provider: string; file: string; body: unknown; script: string; ruleId: string }[] = [
  {
    provider: "Claude settings",
    file: ".claude/settings.json",
    body: {
      hooks: {
        PreToolUse: [{ hooks: [{ type: "command", command: "node .claude/hooks/protect-env.js" }] }],
      },
    },
    script: ".claude/hooks/protect-env.js",
    ruleId: "claude.hook.missing-script",
  },
  {
    provider: "Command Code settings",
    file: ".commandcode/settings.json",
    body: { hooks: { PreToolUse: [{ hooks: [{ type: "command", command: "./scripts/gone.sh" }] }] } },
    script: "gone.sh",
    ruleId: "commandcode.hook.missing-script",
  },
  {
    provider: "Grok hooks dir",
    file: ".grok/hooks/guard.json",
    body: { hooks: { PreToolUse: [{ hooks: [{ type: "command", command: "bin/safety-check.sh" }] }] } },
    script: "safety-check.sh",
    ruleId: "grok.hook.missing-script",
  },
  {
    provider: "Copilot CLI inline settings",
    file: ".github/copilot/settings.json",
    body: { hooks: { preToolUse: [{ bash: "./gone-inline.sh" }] } },
    script: "gone-inline.sh",
    ruleId: "copilot.hook.missing-script",
  },
  {
    provider: "Copilot hooks file, exec field",
    file: ".github/hooks/guard.json",
    body: { version: 1, hooks: { preToolUse: [{ type: "command", exec: "./scripts/gone.sh" }] } },
    script: "gone.sh",
    ruleId: "copilot.hook.missing-script",
  },
  {
    provider: "Kiro hook file",
    file: ".kiro/hooks/guard.json",
    body: {
      version: "v1",
      hooks: [
        { name: "guard", trigger: "PreToolUse", action: { type: "command", command: ".kiro/hooks/gone.sh" } },
      ],
    },
    script: "gone.sh",
    ruleId: "kiro.hook.missing-script",
  },
];

describe("missing hook script", () => {
  test.each(cases)("$provider -> $ruleId", ({ file, body, script, ruleId }) => {
    const root = tmpProject("agentscan-missing-script-");
    write(root, file, JSON.stringify(body));
    const hits = findingsFor(root).findings.filter((f) => f.ruleId.endsWith(".hook.missing-script"));
    expect(hits.map((f) => f.ruleId)).toEqual([ruleId]);
    expect(hits[0]!.severity).toBe("error");
    expect(hits[0]!.action).toBe("warn");
    expect(hits[0]!.subject).toContain(script);
  });
});
