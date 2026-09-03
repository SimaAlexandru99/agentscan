import { describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import { join } from "node:path";
import { mkPinnedProject } from "../helpers/tmp";
import { runChecks } from "../../src/checks/index";
import { defaultConfig } from "../../src/config/schema";
import { extractFacts } from "../../src/facts/extract";

function tmpProject(prefix: string): string {
  return mkPinnedProject(prefix, "claude-surfaces");
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

const PLACEHOLDER = "TEST_SESSION_PLACEHOLDER_NOT_A_REAL_SECRET";

describe("Claude local MCP in ~/.claude.json", () => {
  test("matching projects key is --global only and marked local", () => {
    const root = tmpProject("agentscan-claude-local-mcp-");
    write(root, "AGENTS.md", "keep scanable\n");
    const tmpHome = mkdtempSync(join(os.tmpdir(), "agentscan-claude-home-local-"));
    write(
      tmpHome,
      ".claude.json",
      JSON.stringify({
        projects: {
          [root]: {
            mcpServers: {
              stripe: { url: "https://example.com/mcp" },
            },
          },
        },
      }),
    );
    const homedirSpy = spyOn(os, "homedir").mockReturnValue(tmpHome);
    try {
      expect(findingsFor(root, false).facts.mcp.some((s) => s.name === "stripe")).toBe(false);
      const { facts, findings } = findingsFor(root, true);
      const local = facts.mcp.find((s) => s.name === "stripe");
      expect(local).toBeDefined();
      expect(local!.claudeMcpLayer).toBe("local");
      expect(local!.schemaProfile).toBe("claude-json");
      expect(local!.path).toBe(join(tmpHome, ".claude.json"));
      expect(findings.map((f) => f.ruleId)).toContain("claude.mcp.url-without-type");
    } finally {
      homedirSpy.mockRestore();
    }
  });

  test("other-project projects keys are ignored", () => {
    const root = tmpProject("agentscan-claude-local-other-");
    write(root, "AGENTS.md", "keep scanable\n");
    const tmpHome = mkdtempSync(join(os.tmpdir(), "agentscan-claude-home-other-"));
    write(
      tmpHome,
      ".claude.json",
      JSON.stringify({
        projects: {
          "/tmp/other-project-not-this-scan": {
            mcpServers: {
              other: { command: "npx" },
            },
          },
        },
      }),
    );
    const homedirSpy = spyOn(os, "homedir").mockReturnValue(tmpHome);
    try {
      const { facts } = findingsFor(root, true);
      expect(facts.mcp.some((s) => s.name === "other")).toBe(false);
    } finally {
      homedirSpy.mockRestore();
    }
  });

  test("same name at user, local, and .mcp.json all stay", () => {
    const root = tmpProject("agentscan-claude-mcp-three-");
    write(
      root,
      ".mcp.json",
      JSON.stringify({
        mcpServers: { docs: { command: "npx" } },
      }),
    );
    const tmpHome = mkdtempSync(join(os.tmpdir(), "agentscan-claude-home-three-"));
    write(
      tmpHome,
      ".claude.json",
      JSON.stringify({
        mcpServers: { docs: { command: "npx" } },
        projects: {
          [root]: {
            mcpServers: { docs: { command: "npx" } },
          },
        },
      }),
    );
    const homedirSpy = spyOn(os, "homedir").mockReturnValue(tmpHome);
    try {
      const { facts } = findingsFor(root, true);
      const docs = facts.mcp.filter((s) => s.name === "docs");
      expect(docs).toHaveLength(3);
      expect(docs.some((s) => s.path.endsWith(".mcp.json"))).toBe(true);
      expect(docs.filter((s) => s.path.endsWith(".claude.json"))).toHaveLength(2);
      expect(docs.some((s) => s.claudeMcpLayer === "user")).toBe(true);
      expect(docs.some((s) => s.claudeMcpLayer === "local")).toBe(true);
    } finally {
      homedirSpy.mockRestore();
    }
  });

  test("user and local same-name url-without-type findings both fire", () => {
    const root = tmpProject("agentscan-claude-mcp-layers-");
    write(root, "AGENTS.md", "keep scanable\n");
    const tmpHome = mkdtempSync(join(os.tmpdir(), "agentscan-claude-home-layers-"));
    write(
      tmpHome,
      ".claude.json",
      JSON.stringify({
        mcpServers: { remote: { url: "https://example.com/user" } },
        projects: {
          [root]: {
            mcpServers: { remote: { url: "https://example.com/local" } },
          },
        },
      }),
    );
    const homedirSpy = spyOn(os, "homedir").mockReturnValue(tmpHome);
    try {
      const { findings } = findingsFor(root, true);
      const hits = findings.filter((f) => f.ruleId === "claude.mcp.url-without-type");
      expect(hits).toHaveLength(2);
      const subjects = new Set(hits.map((f) => f.subject));
      expect(subjects.size).toBe(2);
    } finally {
      homedirSpy.mockRestore();
    }
  });

  test("local-only file does not leak sibling non-MCP values", () => {
    const root = tmpProject("agentscan-claude-local-noleak-");
    write(root, "AGENTS.md", "keep scanable\n");
    const tmpHome = mkdtempSync(join(os.tmpdir(), "agentscan-claude-home-local-noleak-"));
    write(
      tmpHome,
      ".claude.json",
      JSON.stringify({
        sessionMarker: PLACEHOLDER,
        projects: {
          [root]: {
            mcpServers: { ok: { command: "npx" } },
            ignoredSibling: PLACEHOLDER,
          },
        },
      }),
    );
    const homedirSpy = spyOn(os, "homedir").mockReturnValue(tmpHome);
    try {
      const { facts, findings } = findingsFor(root, true);
      expect(facts.mcp.some((s) => s.name === "ok" && s.claudeMcpLayer === "local")).toBe(true);
      expect(facts.mcp.some((s) => s.raw.includes(PLACEHOLDER))).toBe(false);
      expect(
        findings.some((f) => f.message.includes(PLACEHOLDER) || f.reason.includes(PLACEHOLDER)),
      ).toBe(false);
    } finally {
      homedirSpy.mockRestore();
    }
  });
});

describe("Claude user agents, memory, rules, and commands", () => {
  test("user agents, CLAUDE.md, rules, and commands are --global only", () => {
    const root = tmpProject("agentscan-claude-user-files-");
    write(root, "AGENTS.md", "keep scanable\n");
    const tmpHome = mkdtempSync(join(os.tmpdir(), "agentscan-claude-home-files-"));
    write(
      tmpHome,
      ".claude/agents/reviewer.md",
      "---\nname: reviewer\ndescription: review\n---\nReview.\n",
    );
    write(tmpHome, ".claude/CLAUDE.md", "user memory\n");
    write(tmpHome, ".claude/rules/style.md", "prefer bun\n");
    write(tmpHome, ".claude/commands/ping.md", "pong\n");
    const homedirSpy = spyOn(os, "homedir").mockReturnValue(tmpHome);
    try {
      const without = findingsFor(root, false);
      expect(without.facts.agents.some((a) => a.path.includes(tmpHome))).toBe(false);
      expect(without.facts.policyFiles.some((p) => p.path.includes(tmpHome))).toBe(false);
      expect(without.facts.rules.some((r) => r.path.includes(tmpHome))).toBe(false);
      expect((without.facts.slashCommands ?? []).some((c) => c.path.includes(tmpHome))).toBe(false);

      const { facts } = findingsFor(root, true);
      expect(facts.agents.some((a) => a.name === "reviewer" && a.sourceProvider === "claude")).toBe(
        true,
      );
      expect(
        facts.policyFiles.some(
          (p) => p.kind === "claude-md" && p.path === join(tmpHome, ".claude", "CLAUDE.md"),
        ),
      ).toBe(true);
      expect(facts.rules.some((r) => r.path === join(tmpHome, ".claude", "rules", "style.md"))).toBe(
        true,
      );
      const ping = (facts.slashCommands ?? []).find((c) => c.name === "ping");
      expect(ping?.source).toBe("global");
      expect(ping?.sourceProvider).toBe("claude");
    } finally {
      homedirSpy.mockRestore();
    }
  });

  test("project .claude/commands are inventoried without --global and hooks use skill source", () => {
    const root = tmpProject("agentscan-claude-project-cmd-");
    write(
      root,
      ".claude/commands/guard.md",
      [
        "---",
        "hooks:",
        "  PreToolUse:",
        "    - hooks:",
        "        - type: command",
        '          command: "node ${CLAUDE_PROJECT_DIR}/.claude/hooks/missing.js"',
        "---",
        "guard",
        "",
      ].join("\n"),
    );
    const { facts, findings } = findingsFor(root, false);
    const command = (facts.slashCommands ?? []).find((c) => c.name === "guard");
    expect(command).toBeDefined();
    expect(command!.source).toBe("project");
    expect(command!.sourceProvider).toBe("claude");
    const hook = facts.hooks.find((h) => h.path === command!.path);
    expect(hook?.source).toBe("skill");
    expect(findings.map((f) => f.ruleId)).toContain("claude.hook.missing-script");
  });
});

describe("In-tree Claude plugin surfaces", () => {
  test("plugin skills, root SKILL.md, agents, commands, and .mcp.json are read", () => {
    const root = tmpProject("agentscan-claude-plugin-");
    write(root, "plugins/demo/.claude-plugin/plugin.json", "{}");
    write(
      root,
      "plugins/demo/skills/hello/SKILL.md",
      "---\ndescription: say hello\n---\nHello.\n",
    );
    write(
      root,
      "plugins/demo/SKILL.md",
      "---\nname: demo-root\ndescription: root skill\n---\nRoot.\n",
    );
    write(
      root,
      "plugins/demo/agents/review.md",
      [
        "---",
        "name: plugin-review",
        "description: review",
        "hooks:",
        "  PreToolUse:",
        "    - hooks:",
        "        - type: command",
        '          command: "node ${CLAUDE_PROJECT_DIR}/.claude/hooks/plugin-agent-missing.js"',
        "---",
        "Review.",
        "",
      ].join("\n"),
    );
    write(
      root,
      "plugins/demo/commands/ship.md",
      [
        "---",
        "hooks:",
        "  PreToolUse:",
        "    - hooks:",
        "        - type: command",
        '          command: "node ${CLAUDE_PROJECT_DIR}/.claude/hooks/plugin-cmd-missing.js"',
        "---",
        "ship",
        "",
      ].join("\n"),
    );
    write(
      root,
      "plugins/demo/.mcp.json",
      JSON.stringify({
        mcpServers: {
          plug: { url: "https://example.com/plugin" },
        },
      }),
    );

    const { facts, findings } = findingsFor(root, false);
    expect(facts.skills.some((s) => s.id === "hello" && s.sourceProvider === "claude")).toBe(true);
    expect(facts.skills.some((s) => s.id === "demo" && s.sourceProvider === "claude")).toBe(true);
    expect(facts.agents.some((a) => a.name === "review" && a.sourceProvider === "claude")).toBe(true);
    const ship = (facts.slashCommands ?? []).find((c) => c.name === "ship");
    expect(ship?.sourceProvider).toBe("claude");
    const plug = facts.mcp.find((s) => s.name === "plug");
    expect(plug?.schemaProfile).toBe("claude-json");
    expect(findings.map((f) => f.ruleId)).toContain("claude.mcp.url-without-type");
    expect(findings.map((f) => f.ruleId)).toContain("claude.hook.missing-script");
    expect(findings.some((f) => f.message.includes("plugin-cmd-missing.js"))).toBe(true);
    expect(findings.some((f) => f.message.includes("plugin-agent-missing.js"))).toBe(false);
    expect(facts.hooks.some((h) => h.path.includes("agents/review.md"))).toBe(false);
  });
});

describe("CLAUDE_CONFIG_DIR", () => {
  test("relocates ~/.claude files and leaves ~/.claude.json in homedir", () => {
    const root = tmpProject("agentscan-claude-config-dir-");
    write(root, "AGENTS.md", "keep scanable\n");
    const tmpHome = mkdtempSync(join(os.tmpdir(), "agentscan-claude-home-cfg-"));
    const alt = mkdtempSync(join(os.tmpdir(), "agentscan-claude-cfgdir-"));
    write(
      alt,
      "settings.json",
      JSON.stringify({
        hooks: {
          NotARealEvent: [{ hooks: [{ type: "command", command: "true" }] }],
        },
      }),
    );
    write(alt, "skills/fromcfg/SKILL.md", "---\ndescription: from config dir\n---\nHi.\n");
    write(
      tmpHome,
      ".claude.json",
      JSON.stringify({
        mcpServers: { fromhome: { command: "npx" } },
      }),
    );
    write(
      tmpHome,
      ".claude/settings.json",
      JSON.stringify({
        hooks: {
          AlsoFake: [{ hooks: [{ type: "command", command: "true" }] }],
        },
      }),
    );
    const previous = process.env.CLAUDE_CONFIG_DIR;
    process.env.CLAUDE_CONFIG_DIR = alt;
    const homedirSpy = spyOn(os, "homedir").mockReturnValue(tmpHome);
    try {
      const { facts, findings } = findingsFor(root, true);
      expect(findings.map((f) => f.ruleId)).toContain("claude.hook.unknown-event");
      expect(facts.hooks.some((h) => h.event === "NotARealEvent" && h.path.startsWith(alt))).toBe(
        true,
      );
      expect(facts.hooks.some((h) => h.event === "AlsoFake")).toBe(false);
      expect(facts.skills.some((s) => s.id === "fromcfg" && s.source === "global")).toBe(true);
      expect(facts.mcp.some((s) => s.name === "fromhome" && s.path === join(tmpHome, ".claude.json"))).toBe(
        true,
      );
    } finally {
      homedirSpy.mockRestore();
      if (previous === undefined) {
        delete process.env.CLAUDE_CONFIG_DIR;
      } else {
        process.env.CLAUDE_CONFIG_DIR = previous;
      }
    }
  });
});
