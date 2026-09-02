import { describe, expect, test, spyOn } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import { join } from "node:path";
import { analyze } from "../../src/analyze";
import { defaultConfig } from "../../src/config/schema";
import { extractFacts } from "../../src/facts/extract";
import { mkPinnedProject } from "../helpers/tmp";

function tmpProject(prefix: string): string {
  return mkPinnedProject(prefix, "copilot-settings");
}

function write(root: string, rel: string, body: string): void {
  const abs = join(root, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, body, "utf8");
}

function ruleIds(dir: string, includeGlobal = false): string[] {
  return analyze({ dir, global: includeGlobal }).findings.map((finding) => finding.ruleId);
}

const sessionStartHook = {
  hooks: {
    sessionStart: [{ type: "command", bash: "echo started", timeoutSec: 10 }],
  },
};

describe("Copilot CLI inline settings hooks", () => {
  test("project settings.json is copilot-cli with source copilot-settings", () => {
    const root = tmpProject("agentscan-copilot-settings-");
    write(root, ".github/copilot/settings.json", JSON.stringify(sessionStartHook));
    const facts = extractFacts(root, defaultConfig, { includeGlobal: false });
    const hook = facts.hooks.find((h) => h.path.endsWith("settings.json"));
    expect(hook).toBeDefined();
    expect(hook!.schemaProfile).toBe("copilot-cli");
    expect(hook!.source).toBe("copilot-settings");
    expect(hook!.sourceProvider).toBe("vscode");
    expect(hook!.event).toBe("sessionStart");
    expect(ruleIds(root)).not.toContain("copilot.hook.unknown-event");
    expect(ruleIds(root)).not.toContain("vscode.hook.unknown-event");
    expect(ruleIds(root)).not.toContain("claude.hook.unknown-handler-type");
  });

  test("settings.local.json is discovered without version: 1", () => {
    const root = tmpProject("agentscan-copilot-settings-local-");
    write(
      root,
      ".github/copilot/settings.local.json",
      JSON.stringify({
        hooks: {
          preToolUse: [{ exec: "true" }],
        },
      }),
    );
    const facts = extractFacts(root, defaultConfig, { includeGlobal: false });
    expect(facts.hooks).toHaveLength(1);
    expect(facts.hooks[0]!.source).toBe("copilot-settings");
    expect(facts.hooks[0]!.schemaProfile).toBe("copilot-cli");
    expect(ruleIds(root)).not.toContain("copilot.hook.command-without-command");
  });

  test("missing script in inline settings is copilot.hook.missing-script", () => {
    const root = tmpProject("agentscan-copilot-settings-gone-");
    write(
      root,
      ".github/copilot/settings.json",
      JSON.stringify({
        hooks: {
          preToolUse: [{ bash: "./gone-inline.sh" }],
        },
      }),
    );
    const ids = ruleIds(root);
    expect(ids).toContain("copilot.hook.missing-script");
    expect(ids).not.toContain("vscode.hook.missing-script");
    expect(ids).not.toContain("claude.hook.missing-script");
  });

  test("inline settings coexist with .github/hooks files", () => {
    const root = tmpProject("agentscan-copilot-settings-coexist-");
    write(
      root,
      ".github/hooks/session.json",
      JSON.stringify({
        version: 1,
        hooks: { sessionStart: [{ bash: "echo file" }] },
      }),
    );
    write(root, ".github/copilot/settings.json", JSON.stringify(sessionStartHook));
    const facts = extractFacts(root, defaultConfig, { includeGlobal: false });
    expect(facts.hooks).toHaveLength(2);
    expect(facts.hooks.some((h) => h.source === "copilot-settings")).toBe(true);
    expect(facts.hooks.some((h) => h.source === "vscode-hooks")).toBe(true);
  });

  test(".claude/settings.json stays on the Claude profile", () => {
    const root = tmpProject("agentscan-copilot-not-claude-");
    write(
      root,
      ".claude/settings.json",
      JSON.stringify({
        hooks: {
          PreToolUse: [{ hooks: [{ type: "command", command: "true" }] }],
        },
      }),
    );
    const facts = extractFacts(root, defaultConfig, { includeGlobal: false });
    expect(facts.hooks).toHaveLength(1);
    expect(facts.hooks[0]!.schemaProfile).toBe("claude");
    expect(facts.hooks[0]!.source).toBe("settings");
    expect(facts.hooks[0]!.source).not.toBe("copilot-settings");
  });

  test("user ~/.copilot/settings.json is --global only", () => {
    const root = tmpProject("agentscan-copilot-user-settings-");
    write(root, "AGENTS.md", "keep scanable\n");
    const tmpHome = mkdtempSync(join(os.tmpdir(), "agentscan-copilot-home-"));
    write(
      tmpHome,
      ".copilot/settings.json",
      JSON.stringify({
        hooks: {
          notARealEvent: [{ bash: "true" }],
        },
      }),
    );
    const homedirSpy = spyOn(os, "homedir").mockReturnValue(tmpHome);
    try {
      expect(ruleIds(root, false)).not.toContain("copilot.hook.unknown-event");
      expect(ruleIds(root, true)).toContain("copilot.hook.unknown-event");
      const facts = extractFacts(root, defaultConfig, { includeGlobal: true });
      const user = facts.hooks.find((h) => h.source === "copilot-settings");
      expect(user?.schemaProfile).toBe("copilot-cli");
    } finally {
      homedirSpy.mockRestore();
    }
  });

  test("COPILOT_HOME overrides ~/.copilot for user settings and hooks", () => {
    const root = tmpProject("agentscan-copilot-home-env-");
    write(root, "AGENTS.md", "keep scanable\n");
    const altHome = mkdtempSync(join(os.tmpdir(), "agentscan-copilot-althome-"));
    write(
      altHome,
      "settings.json",
      JSON.stringify({
        hooks: {
          sessionEnd: [{ bash: "echo end" }],
        },
      }),
    );
    write(
      altHome,
      "hooks/extra.json",
      JSON.stringify({
        version: 1,
        hooks: {
          errorOccurred: [{ bash: "echo err" }],
        },
      }),
    );
    const previous = process.env.COPILOT_HOME;
    process.env.COPILOT_HOME = altHome;
    try {
      const without = extractFacts(root, defaultConfig, { includeGlobal: false });
      expect(without.hooks).toHaveLength(0);
      const facts = extractFacts(root, defaultConfig, { includeGlobal: true });
      expect(facts.hooks.some((h) => h.source === "copilot-settings" && h.event === "sessionEnd")).toBe(
        true,
      );
      expect(facts.hooks.some((h) => h.source === "vscode-hooks" && h.event === "errorOccurred")).toBe(
        true,
      );
    } finally {
      if (previous === undefined) {
        delete process.env.COPILOT_HOME;
      } else {
        process.env.COPILOT_HOME = previous;
      }
    }
  });
});
