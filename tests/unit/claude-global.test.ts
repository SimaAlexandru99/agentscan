import { describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import { join } from "node:path";
import { mkPinnedProject } from "../helpers/tmp";
import { runChecks } from "../../src/checks/index";
import { defaultConfig } from "../../src/config/schema";
import { mcpProfileFromPath } from "../../src/facts/provider";
import { extractFacts } from "../../src/facts/extract";

function tmpProject(prefix: string): string {
  return mkPinnedProject(prefix, "claude-global");
}

function write(root: string, rel: string, body: string): void {
  const abs = join(root, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, body, "utf8");
}

function findingsFor(root: string, includeGlobal = false) {
  const facts = extractFacts(root, defaultConfig, { includeGlobal });
  return { facts, findings: runChecks(facts) };
}

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
    const homedirSpy = spyOn(os, "homedir").mockReturnValue(tmpHome);
    try {
      const without = findingsFor(root, false);
      expect(without.findings.map((f) => f.ruleId)).not.toContain("claude.hook.unknown-event");
      const { facts, findings } = findingsFor(root, true);
      expect(findings.map((f) => f.ruleId)).toContain("claude.hook.unknown-event");
      const user = facts.hooks.find((h) => h.event === "NotARealEvent");
      expect(user?.path).toBe(join(tmpHome, ".claude", "settings.json"));
      expect(user?.schemaProfile).toBe("claude");
      expect(user?.source).toBe("settings");
    } finally {
      homedirSpy.mockRestore();
    }
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
    const homedirSpy = spyOn(os, "homedir").mockReturnValue(tmpHome);
    try {
      const { findings } = findingsFor(root, true);
      const hit = findings.find((f) => f.ruleId === "claude.hook.missing-script");
      expect(hit).toBeDefined();
      expect(hit!.message).toContain("guard-destructive-bash.js");
      expect(hit!.evidence.some((e) => e.value.includes("guard-destructive-bash.js"))).toBe(true);
      const blob = `${hit!.message}\n${hit!.reason}\n${hit!.evidence.map((e) => e.value).join("\n")}`;
      expect(blob).not.toContain("hooks\":");
    } finally {
      homedirSpy.mockRestore();
    }
  });

  test("user and project hooks coexist on the same event", () => {
    const root = tmpProject("agentscan-claude-hooks-coexist-");
    write(root, ".claude/settings.json", JSON.stringify(nestedCommand));
    const tmpHome = mkdtempSync(join(os.tmpdir(), "agentscan-claude-home-coexist-"));
    write(tmpHome, ".claude/settings.json", JSON.stringify(nestedCommand));
    const homedirSpy = spyOn(os, "homedir").mockReturnValue(tmpHome);
    try {
      const { facts } = findingsFor(root, true);
      const pre = facts.hooks.filter((h) => h.event === "PreToolUse");
      expect(pre).toHaveLength(2);
      expect(pre.some((h) => h.path === join(root, ".claude", "settings.json"))).toBe(true);
      expect(pre.some((h) => h.path === join(tmpHome, ".claude", "settings.json"))).toBe(true);
    } finally {
      homedirSpy.mockRestore();
    }
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
    const homedirSpy = spyOn(os, "homedir").mockReturnValue(tmpHome);
    try {
      expect(findingsFor(root, false).facts.mcp.some((s) => s.name === "remote")).toBe(false);
      const { facts, findings } = findingsFor(root, true);
      const user = facts.mcp.find((s) => s.name === "remote");
      expect(user).toBeDefined();
      expect(user!.schemaProfile).toBe("claude-json");
      expect(user!.consumedBy).toContain("claude");
      expect(user!.claudeMcpLayer).toBe("user");
      expect(user!.path).toBe(join(tmpHome, ".claude.json"));
      expect(findings.map((f) => f.ruleId)).toContain("claude.mcp.url-without-type");
    } finally {
      homedirSpy.mockRestore();
    }
  });

  test("absent mcpServers is not config.unreadable", () => {
    const root = tmpProject("agentscan-claude-json-noservers-");
    write(root, "AGENTS.md", "keep scanable\n");
    const tmpHome = mkdtempSync(join(os.tmpdir(), "agentscan-claude-home-noservers-"));
    write(tmpHome, ".claude.json", JSON.stringify({ numStartups: 1 }));
    const homedirSpy = spyOn(os, "homedir").mockReturnValue(tmpHome);
    try {
      const { facts, findings } = findingsFor(root, true);
      expect(facts.mcp.some((s) => s.path === join(tmpHome, ".claude.json"))).toBe(false);
      expect(findings.map((f) => f.ruleId)).not.toContain("config.unreadable");
    } finally {
      homedirSpy.mockRestore();
    }
  });

  test("non-MCP top-level keys never become servers", () => {
    const root = tmpProject("agentscan-claude-json-projects-");
    write(root, "AGENTS.md", "keep scanable\n");
    const tmpHome = mkdtempSync(join(os.tmpdir(), "agentscan-claude-home-projects-"));
    write(tmpHome, ".claude.json", JSON.stringify({ numStartups: 1, projects: {} }));
    const homedirSpy = spyOn(os, "homedir").mockReturnValue(tmpHome);
    try {
      const { facts } = findingsFor(root, true);
      expect(facts.mcp.filter((s) => s.path.includes(tmpHome))).toEqual([]);
    } finally {
      homedirSpy.mockRestore();
    }
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
    const homedirSpy = spyOn(os, "homedir").mockReturnValue(tmpHome);
    try {
      const { facts, findings } = findingsFor(root, true);
      expect(facts.mcp.some((s) => s.name === "ok")).toBe(true);
      expect(facts.mcp.some((s) => s.raw.includes(placeholder))).toBe(false);
      expect(
        findings.some(
          (f) => f.message.includes(placeholder) || f.reason.includes(placeholder),
        ),
      ).toBe(false);
    } finally {
      homedirSpy.mockRestore();
    }
  });

  test("same name in .mcp.json and ~/.claude.json both stay; secrets still inspect user raw", () => {
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
    const homedirSpy = spyOn(os, "homedir").mockReturnValue(tmpHome);
    try {
      const { facts, findings } = findingsFor(root, true);
      const pair = facts.mcp.filter((s) => s.name === "docs");
      expect(pair).toHaveLength(2);
      expect(pair.some((s) => s.path.endsWith(".mcp.json"))).toBe(true);
      expect(pair.some((s) => s.path.endsWith(".claude.json"))).toBe(true);
      expect(findings.map((f) => f.ruleId)).toContain("mcp.literal-env");
    } finally {
      homedirSpy.mockRestore();
    }
  });

  test("mcpProfileFromPath maps ~/.claude.json to claude-json", () => {
    expect(mcpProfileFromPath("/home/me/.claude.json")).toBe("claude-json");
    expect(mcpProfileFromPath("C:\\Users\\me\\.claude.json")).toBe("claude-json");
  });
});
