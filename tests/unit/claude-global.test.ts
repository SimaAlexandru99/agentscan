import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import * as os from "node:os";
import { join } from "node:path";
import { tmpProject, write } from "../helpers/tmp";
import { mcpProfileFromPath } from "../../src/facts/provider";
import { findingsFor } from "../helpers/scan";
import { withHome } from "../helpers/env";

const nestedCommand = {
  hooks: {
    PreToolUse: [{ hooks: [{ type: "command", command: "true" }] }],
  },
};

const unknownEvent = {
  hooks: {
    NotARealEvent: [{ hooks: [{ type: "command", command: "true" }] }],
  },
};

describe("Claude user hooks and MCP are --global only", () => {
  test("project settings still work without --global", () => {
    const root = tmpProject("agentscan-claude-project-settings-");
    write(root, ".claude/settings.json", JSON.stringify(nestedCommand));
    const { facts } = findingsFor(root, false);
    expect(facts.hooks).toHaveLength(1);
    expect(facts.hooks[0]!.schemaProfile).toBe("claude");
    expect(facts.hooks[0]!.source).toBe("settings");
    expect(facts.hooks[0]!.path.endsWith(".claude/settings.json")).toBe(true);
  });

  test("user ~/.claude/settings.json is --global only", () => {
    const root = tmpProject("agentscan-claude-user-hooks-noglobal-");
    write(root, "AGENTS.md", "keep scanable\n");
    const tmpHome = mkdtempSync(join(os.tmpdir(), "agentscan-claude-home-"));
    write(tmpHome, ".claude/settings.json", JSON.stringify(unknownEvent));
    withHome(tmpHome, () => {
      const without = findingsFor(root, false);
      expect(without.findings.map((f) => f.ruleId)).not.toContain("claude.hook.unknown-event");
      const { facts, findings } = findingsFor(root, true);
      expect(findings.map((f) => f.ruleId)).toContain("claude.hook.unknown-event");
      const user = facts.hooks.find((h) => h.event === "NotARealEvent");
      expect(user?.path).toBe(join(tmpHome, ".claude", "settings.json"));
      expect(user?.schemaProfile).toBe("claude");
      expect(user?.source).toBe("settings");
    });
  });

  test("missing script in user settings is claude.hook.missing-script", () => {
    const root = tmpProject("agentscan-claude-user-missing-");
    write(root, "AGENTS.md", "keep scanable\n");
    const tmpHome = mkdtempSync(join(os.tmpdir(), "agentscan-claude-home-miss-"));
    write(
      tmpHome,
      ".claude/settings.json",
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              hooks: [
                {
                  type: "command",
                  command:
                    'node "${CLAUDE_PROJECT_DIR}/.claude/hooks/guard-destructive-bash.js"',
                },
              ],
            },
          ],
        },
      }),
    );
    withHome(tmpHome, () => {
      const { findings } = findingsFor(root, true);
      const hit = findings.find((f) => f.ruleId === "claude.hook.missing-script");
      expect(hit).toBeDefined();
      expect(hit!.message).toContain("guard-destructive-bash.js");
      expect(hit!.evidence.some((e) => e.value.includes("guard-destructive-bash.js"))).toBe(true);
      const blob = `${hit!.message}\n${hit!.reason}\n${hit!.evidence.map((e) => e.value).join("\n")}`;
      expect(blob).not.toContain("hooks\":");
    });
  });

  test("user and project hooks coexist on the same event", () => {
    const root = tmpProject("agentscan-claude-hooks-coexist-");
    write(root, ".claude/settings.json", JSON.stringify(nestedCommand));
    const tmpHome = mkdtempSync(join(os.tmpdir(), "agentscan-claude-home-coexist-"));
    write(tmpHome, ".claude/settings.json", JSON.stringify(nestedCommand));
    withHome(tmpHome, () => {
      const { facts } = findingsFor(root, true);
      const pre = facts.hooks.filter((h) => h.event === "PreToolUse");
      expect(pre).toHaveLength(2);
      expect(pre.some((h) => h.path === join(root, ".claude", "settings.json"))).toBe(true);
      expect(pre.some((h) => h.path === join(tmpHome, ".claude", "settings.json"))).toBe(true);
    });
  });

  test("user ~/.claude.json MCP is --global only", () => {
    const root = tmpProject("agentscan-claude-user-mcp-");
    write(root, "AGENTS.md", "keep scanable\n");
    const tmpHome = mkdtempSync(join(os.tmpdir(), "agentscan-claude-home-mcp-"));
    write(
      tmpHome,
      ".claude.json",
      JSON.stringify({
        mcpServers: {
          remote: { url: "https://example.com/mcp" },
        },
      }),
    );
    withHome(tmpHome, () => {
      expect(findingsFor(root, false).facts.mcp.some((s) => s.name === "remote")).toBe(false);
      const { facts, findings } = findingsFor(root, true);
      const user = facts.mcp.find((s) => s.name === "remote");
      expect(user).toBeDefined();
      expect(user!.schemaProfile).toBe("claude-json");
      expect(user!.consumedBy).toContain("claude");
      expect(user!.claudeMcpLayer).toBe("user");
      expect(user!.path).toBe(join(tmpHome, ".claude.json"));
      expect(findings.map((f) => f.ruleId)).toContain("claude.mcp.url-without-type");
    });
  });

  test("absent mcpServers is not config.unreadable", () => {
    const root = tmpProject("agentscan-claude-json-noservers-");
    write(root, "AGENTS.md", "keep scanable\n");
    const tmpHome = mkdtempSync(join(os.tmpdir(), "agentscan-claude-home-noservers-"));
    write(tmpHome, ".claude.json", JSON.stringify({ numStartups: 1 }));
    withHome(tmpHome, () => {
      const { facts, findings } = findingsFor(root, true);
      expect(facts.mcp.some((s) => s.path === join(tmpHome, ".claude.json"))).toBe(false);
      expect(findings.map((f) => f.ruleId)).not.toContain("config.unreadable");
    });
  });

  test("non-MCP top-level keys never become servers", () => {
    const root = tmpProject("agentscan-claude-json-projects-");
    write(root, "AGENTS.md", "keep scanable\n");
    const tmpHome = mkdtempSync(join(os.tmpdir(), "agentscan-claude-home-projects-"));
    write(tmpHome, ".claude.json", JSON.stringify({ numStartups: 1, projects: {} }));
    withHome(tmpHome, () => {
      const { facts } = findingsFor(root, true);
      expect(facts.mcp.filter((s) => s.path.includes(tmpHome))).toEqual([]);
    });
  });

  test("session-shaped sibling values never leak into facts or findings", () => {
    const root = tmpProject("agentscan-claude-json-noleak-");
    write(root, "AGENTS.md", "keep scanable\n");
    const tmpHome = mkdtempSync(join(os.tmpdir(), "agentscan-claude-home-noleak-"));
    const placeholder = "TEST_SESSION_PLACEHOLDER_NOT_A_REAL_SECRET";
    write(
      tmpHome,
      ".claude.json",
      JSON.stringify({
        sessionMarker: placeholder,
        mcpServers: {
          ok: { command: "npx" },
        },
      }),
    );
    withHome(tmpHome, () => {
      const { facts, findings } = findingsFor(root, true);
      expect(facts.mcp.some((s) => s.name === "ok")).toBe(true);
      expect(JSON.stringify(facts.mcp)).not.toContain(placeholder);
      expect(
        findings.some(
          (f) => f.message.includes(placeholder) || f.reason.includes(placeholder),
        ),
      ).toBe(false);
    });
  });

  test("same name in .mcp.json and ~/.claude.json both stay", () => {
    const root = tmpProject("agentscan-claude-mcp-both-");
    write(
      root,
      ".mcp.json",
      JSON.stringify({
        mcpServers: {
          docs: { command: "npx" },
        },
      }),
    );
    const tmpHome = mkdtempSync(join(os.tmpdir(), "agentscan-claude-home-both-"));
    write(
      tmpHome,
      ".claude.json",
      JSON.stringify({
        mcpServers: {
          docs: {
            command: "npx",
            env: { API_TOKEN: "not-interpolated-literal" },
          },
        },
      }),
    );
    withHome(tmpHome, () => {
      const { facts } = findingsFor(root, true);
      const pair = facts.mcp.filter((s) => s.name === "docs");
      expect(pair).toHaveLength(2);
      expect(pair.some((s) => s.path.endsWith(".mcp.json"))).toBe(true);
      expect(pair.some((s) => s.path.endsWith(".claude.json"))).toBe(true);
    });
  });

  test("a Windows ~/.claude.json path maps to claude-json", () => {
    // The POSIX path is covered by the --global scan above; a Windows host cannot be scanned here.
    expect(mcpProfileFromPath("C:\\Users\\me\\.claude.json")).toBe("claude-json");
  });
});

describe("--global scan rooted at the home directory", () => {
  test("~/.claude/agents is read once, not reported as a duplicate of itself", () => {
    const home = tmpProject("agentscan-claude-home-root-");
    write(home, ".claude/agents/critic.md", "---\nname: critic\ndescription: Reviews diffs\n---\nBody\n");
    withHome(home, () => {
      const { facts, findings } = findingsFor(home, true);
      expect(facts.agents.filter((a) => a.path.endsWith("critic.md"))).toHaveLength(1);
      expect(findings.map((f) => f.ruleId)).not.toContain("claude.agent.duplicate-name");
    });
  });
});
