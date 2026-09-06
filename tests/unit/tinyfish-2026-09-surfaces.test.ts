import { describe, expect, spyOn, test } from "bun:test";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import { join } from "node:path";
import { runChecks } from "../../src/checks/index";
import { defaultConfig } from "../../src/config/schema";
import { inferHookSchemaProfile } from "../../src/facts/hook-schema";
import { extractFacts } from "../../src/facts/extract";
import { mkPinnedProject } from "../helpers/tmp";

function write(root: string, rel: string, body: string): void {
  const abs = join(root, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, body, "utf8");
}

function script(root: string, rel: string): void {
  write(root, rel, "#!/bin/sh\nexit 0\n");
  chmodSync(join(root, rel), 0o755);
}

function skillMd(name: string, description?: string): string {
  const desc = description === undefined ? "" : `description: ${description}\n`;
  return `---\nname: ${name}\n${desc}---\n\n# ${name}\n`;
}

function scan(root: string, includeGlobal = false) {
  const facts = extractFacts(root, defaultConfig, { includeGlobal });
  return { facts, findings: runChecks(facts), ruleIds: runChecks(facts).map((f) => f.ruleId) };
}

describe("Kiro hook profile is not Claude", () => {
  test("inferHookSchemaProfile(kiro) is kiro", () => {
    expect(inferHookSchemaProfile("kiro")).toBe("kiro");
  });

  test("official-shaped hook with a present script is clean", () => {
    const root = mkPinnedProject("agentscan-kiro-ok-", "kiro");
    script(root, ".kiro/hooks/lint.sh");
    write(
      root,
      ".kiro/hooks/lint-on-save.json",
      JSON.stringify({
        version: "v1",
        hooks: [
          {
            name: "Lint on save",
            trigger: "PostFileSave",
            matcher: "\\.(ts|tsx)$",
            action: { type: "command", command: ".kiro/hooks/lint.sh" },
          },
        ],
      }),
    );
    const { facts, ruleIds } = scan(root);
    expect(facts.hooks.filter((h) => h.schemaProfile === "kiro")).toHaveLength(1);
    expect(ruleIds.filter((id) => id.startsWith("kiro.hook."))).toEqual([]);
  });

  test("every quoted trigger is accepted", () => {
    const root = mkPinnedProject("agentscan-kiro-all-", "kiro");
    script(root, ".kiro/hooks/x.sh");
    const events = [
      "SessionStart",
      "Stop",
      "UserPromptSubmit",
      "PreTaskExec",
      "PostTaskExec",
      "PreToolUse",
      "PostToolUse",
      "PostFileCreate",
      "PostFileSave",
      "PostFileDelete",
    ];
    write(
      root,
      ".kiro/hooks/all.json",
      JSON.stringify({
        version: "v1",
        hooks: events.map((trigger) => ({
          name: trigger,
          trigger,
          action: { type: "command", command: ".kiro/hooks/x.sh" },
        })),
      }),
    );
    expect(scan(root).ruleIds.filter((id) => id.startsWith("kiro.hook."))).toEqual([]);
  });

  test("missing script is kiro.hook.missing-script", () => {
    const root = mkPinnedProject("agentscan-kiro-miss-", "kiro");
    write(
      root,
      ".kiro/hooks/guard.json",
      JSON.stringify({
        version: "v1",
        hooks: [
          {
            name: "guard",
            trigger: "PreToolUse",
            action: { type: "command", command: ".kiro/hooks/gone.sh" },
          },
        ],
      }),
    );
    expect(scan(root).ruleIds).toContain("kiro.hook.missing-script");
  });

  test("unknown trigger is kiro.hook.unknown-event not Claude", () => {
    const root = mkPinnedProject("agentscan-kiro-unk-", "kiro");
    write(
      root,
      ".kiro/hooks/bad.json",
      JSON.stringify({
        version: "v1",
        hooks: [{ name: "x", trigger: "NotAKiroEvent", action: { type: "agent", prompt: "hi" } }],
      }),
    );
    const { ruleIds } = scan(root);
    expect(ruleIds).toContain("kiro.hook.unknown-event");
    expect(ruleIds).not.toContain("claude.hook.unknown-event");
  });

  test("prose FileSave is unknown, not PostFileSave", () => {
    const root = mkPinnedProject("agentscan-kiro-prose-", "kiro");
    write(
      root,
      ".kiro/hooks/save.json",
      JSON.stringify({
        version: "v1",
        hooks: [{ name: "x", trigger: "FileSave", action: { type: "command", command: "echo" } }],
      }),
    );
    expect(scan(root).ruleIds).toContain("kiro.hook.unknown-event");
  });

  test("command without command, agent without prompt, unknown type, invalid file", () => {
    const root = mkPinnedProject("agentscan-kiro-defects-", "kiro");
    write(
      root,
      ".kiro/hooks/no-cmd.json",
      JSON.stringify({
        version: "v1",
        hooks: [{ name: "x", trigger: "Stop", action: { type: "command" } }],
      }),
    );
    write(
      root,
      ".kiro/hooks/no-prompt.json",
      JSON.stringify({
        version: "v1",
        hooks: [{ name: "y", trigger: "Stop", action: { type: "agent" } }],
      }),
    );
    write(
      root,
      ".kiro/hooks/bad-type.json",
      JSON.stringify({
        version: "v1",
        hooks: [{ name: "z", trigger: "Stop", action: { type: "http" } }],
      }),
    );
    const { ruleIds } = scan(root);
    expect(ruleIds.filter((id) => id.startsWith("kiro.hook.")).sort()).toEqual([
      "kiro.hook.command-without-command",
      "kiro.hook.prompt-without-prompt",
      "kiro.hook.unknown-handler-type",
    ]);
  });

  test("hooks array without version v1 is only invalid-group, and the message is about version", () => {
    const root = mkPinnedProject("agentscan-kiro-nover-", "kiro");
    write(root, ".kiro/hooks/no-version.json", JSON.stringify({ hooks: [] }));
    const { findings } = scan(root);
    const kiro = findings.filter((f) => f.ruleId.startsWith("kiro.hook."));
    expect(kiro.map((f) => f.ruleId)).toEqual(["kiro.hook.invalid-group"]);
    expect(kiro[0]!.message).toContain('version "v1"');
    expect(kiro[0]!.message).not.toMatch(/missing a `hooks` array/);
    expect(kiro[0]!.message).not.toContain("(file)");
  });

  test("version v2 with a hooks array is invalid-group about version, not a missing array or unknown event", () => {
    const root = mkPinnedProject("agentscan-kiro-v2-", "kiro");
    script(root, ".kiro/hooks/x.sh");
    write(
      root,
      ".kiro/hooks/v2.json",
      JSON.stringify({
        version: "v2",
        hooks: [
          {
            name: "ok",
            trigger: "PostFileSave",
            action: { type: "command", command: ".kiro/hooks/x.sh" },
          },
        ],
      }),
    );
    const { findings } = scan(root);
    const kiro = findings.filter((f) => f.ruleId.startsWith("kiro.hook."));
    expect(kiro.map((f) => f.ruleId)).toEqual(["kiro.hook.invalid-group"]);
    expect(kiro[0]!.message).toContain('version "v1"');
    expect(kiro[0]!.message).not.toMatch(/missing a `hooks` array/);
  });

  test("version v1 without a hooks array names the missing array", () => {
    const root = mkPinnedProject("agentscan-kiro-nohooks-", "kiro");
    write(root, ".kiro/hooks/no-hooks.json", JSON.stringify({ version: "v1" }));
    const { findings } = scan(root);
    const kiro = findings.filter((f) => f.ruleId.startsWith("kiro.hook."));
    expect(kiro.map((f) => f.ruleId)).toEqual(["kiro.hook.invalid-group"]);
    expect(kiro[0]!.message).toMatch(/missing a `hooks` array/);
    expect(kiro[0]!.message).not.toContain("(file)");
  });

  test("enabled false is skipped; matching skill is clean", () => {
    const root = mkPinnedProject("agentscan-kiro-skip-skill-", "kiro");
    write(
      root,
      ".kiro/hooks/off.json",
      JSON.stringify({
        version: "v1",
        hooks: [
          {
            name: "off",
            trigger: "NotAKiroEvent",
            enabled: false,
            action: { type: "command", command: "gone.sh" },
          },
        ],
      }),
    );
    write(root, ".kiro/skills/aws-deploy/SKILL.md", skillMd("aws-deploy", "Deploy to AWS using CDK."));
    const { facts, ruleIds } = scan(root);
    expect(facts.hooks.filter((h) => h.schemaProfile === "kiro")).toHaveLength(0);
    expect(ruleIds.filter((id) => id.startsWith("kiro.hook."))).toEqual([]);
    expect(ruleIds.filter((id) => id.startsWith("agent-skills.skill."))).toEqual([]);
  });
});

describe("Cline/Roo/Kilo Agent Skills", () => {
  for (const [label, rel] of [
    ["Cline", ".cline/skills"],
    ["Roo", ".roo/skills"],
    ["Kilo", ".kilo/skills"],
  ] as const) {
    test(`${label} matching name is clean; mismatch errors`, () => {
      const root = mkPinnedProject(`agentscan-${label.toLowerCase()}-skill-`, label.toLowerCase());
      write(root, `${rel}/aws-deploy/SKILL.md`, skillMd("aws-deploy", "Deploy to AWS using CDK."));
      expect(scan(root).ruleIds.filter((id) => id.startsWith("agent-skills.skill."))).toEqual([]);

      const bad = mkPinnedProject(`agentscan-${label.toLowerCase()}-mismatch-`, label.toLowerCase());
      write(bad, `${rel}/aws-deploy/SKILL.md`, skillMd("other", "Deploy to AWS using CDK."));
      expect(scan(bad).ruleIds).toContain("agent-skills.skill.name-does-not-match-directory");
    });
  }
});

describe("Junie skills do not require description", () => {
  test("Junie skill with name and no description is not a description error", () => {
    const root = mkPinnedProject("agentscan-junie-nodesc-", "junie");
    write(root, ".junie/skills/foo/SKILL.md", skillMd("foo"));
    const { ruleIds } = scan(root);
    expect(ruleIds).not.toContain("agent-skills.skill.missing-description");
    expect(ruleIds.filter((id) => id.startsWith("agent-skills.skill."))).toEqual([]);
  });

  test("portable .agents/skills without description is still an error", () => {
    const root = mkPinnedProject("agentscan-junie-agents-desc-", "junie");
    write(root, ".agents/skills/foo/SKILL.md", skillMd("foo"));
    expect(scan(root).ruleIds).toContain("agent-skills.skill.missing-description");
  });

  test("Junie name not matching the directory is not an error", () => {
    const root = mkPinnedProject("agentscan-junie-mismatch-", "junie");
    write(root, ".junie/skills/foo/SKILL.md", skillMd("other"));
    expect(scan(root).ruleIds).not.toContain("agent-skills.skill.name-does-not-match-directory");
  });
});

describe("VS Code agent frontmatter hooks are vscode-native", () => {
  test("documented PostToolUse command hook is not claude.hook.invalid-group", () => {
    const root = mkPinnedProject("agentscan-vscode-agent-hook-", "vscode");
    script(root, "scripts/format-changed-files.sh");
    write(
      root,
      ".github/agents/fmt.agent.md",
      `---
name: Strict Formatter
description: Agent that auto-formats code after every edit
hooks:
  PostToolUse:
    - type: command
      command: "./scripts/format-changed-files.sh"
---

You format code after edits.
`,
    );
    const { facts, ruleIds } = scan(root);
    const agentHooks = facts.hooks.filter((h) => h.source === "agent");
    expect(agentHooks.length).toBeGreaterThan(0);
    expect(agentHooks.every((h) => h.schemaProfile === "vscode-native")).toBe(true);
    expect(ruleIds).not.toContain("claude.hook.invalid-group");
    expect(ruleIds.filter((id) => id.startsWith("vscode.hook."))).toEqual([]);
  });
});

describe("--global user files stay off the default scan", () => {
  test("Cursor user hooks, Gemini user settings, and Antigravity global MCP", () => {
    const root = mkPinnedProject("agentscan-global-surfaces-", "global");
    const tmpHome = mkPinnedProject("agentscan-global-home-", "home");
    write(
      tmpHome,
      ".cursor/hooks.json",
      JSON.stringify({
        version: 1,
        hooks: { preToolUse: [{ command: ".cursor/hooks/gone.sh" }] },
      }),
    );
    write(
      tmpHome,
      ".gemini/settings.json",
      JSON.stringify({
        hooks: {
          BeforeTool: [{ hooks: [{ type: "command", command: ".gemini/hooks/gone.sh" }] }],
        },
        mcpServers: { empty: {} },
      }),
    );
    write(
      tmpHome,
      ".gemini/config/mcp_config.json",
      JSON.stringify({ mcpServers: { remote: { url: "https://example.com/mcp" } } }),
    );
    write(tmpHome, ".gemini/mcp-oauth-tokens.json", '{"token":"secret"}');

    const homedirSpy = spyOn(os, "homedir").mockReturnValue(tmpHome);
    try {
      const off = scan(root, false);
      expect(off.ruleIds).not.toContain("cursor.hook.missing-script");
      expect(off.ruleIds).not.toContain("gemini.hook.missing-script");
      expect(off.ruleIds).not.toContain("gemini.mcp.no-launch");
      expect(off.ruleIds).not.toContain("antigravity.mcp.no-launch");
      expect(off.facts.mcp.some((s) => s.path.includes("mcp-oauth-tokens"))).toBe(false);

      const on = scan(root, true);
      expect(on.ruleIds).toContain("cursor.hook.missing-script");
      expect(on.ruleIds).toContain("gemini.hook.missing-script");
      expect(on.ruleIds).toContain("gemini.mcp.no-launch");
      expect(on.ruleIds).toContain("antigravity.mcp.no-launch");
      expect(on.facts.mcp.some((s) => s.path.includes("mcp-oauth-tokens"))).toBe(false);
    } finally {
      homedirSpy.mockRestore();
    }
  });
});

describe("Copilot-only events in Claude settings stay Claude-unknown", () => {
  test("sessionEnd in .claude/settings.json is claude.hook.unknown-event", () => {
    const root = mkPinnedProject("agentscan-copilot-claude-settings-", "claude");
    write(
      root,
      ".claude/settings.json",
      JSON.stringify({
        hooks: {
          sessionEnd: [{ hooks: [{ type: "command", command: "echo done" }] }],
        },
      }),
    );
    const { ruleIds } = scan(root);
    expect(ruleIds).toContain("claude.hook.unknown-event");
    expect(ruleIds).not.toContain("copilot.hook.unknown-event");
  });
});
