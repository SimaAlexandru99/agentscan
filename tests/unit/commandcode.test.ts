import { describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import { join } from "node:path";
import { analyze } from "../../src/analyze";
import { runChecks } from "../../src/checks/index";
import { defaultConfig } from "../../src/config/schema";
import { mcpCommandPath } from "../../src/discover/mcp";
import { extractFacts } from "../../src/facts/extract";

function tmpProject(prefix: string): string {
  const root = mkdtempSync(join(os.tmpdir(), prefix));
  writeFileSync(join(root, "package.json"), '{"name":"cc"}', "utf8");
  return root;
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

function ruleIds(root: string, includeGlobal = false): string[] {
  return findingsFor(root, includeGlobal).findings.map((f) => f.ruleId);
}

describe("Command Code shared MCP JSON", () => {
  test("transport http + url on .mcp.json is not claude.mcp.url-without-type", () => {
    const root = tmpProject("agentscan-cc-mcp-http-");
    write(
      root,
      ".mcp.json",
      JSON.stringify({
        mcpServers: { stripe: { transport: "http", url: "https://mcp.stripe.com" } },
      }),
    );
    const { facts, findings } = findingsFor(root);
    expect(facts.mcp[0]!.schemaProfile).toBe("mcp-json");
    expect(facts.mcp[0]!.sourceProvider).toBe("unknown");
    expect(facts.mcp[0]!.consumedBy).toEqual(["claude", "commandcode"]);
    expect(facts.mcp[0]!.transportField).toBe("transport");
    expect(findings.map((f) => f.ruleId)).not.toContain("claude.mcp.url-without-type");
    expect(findings.map((f) => f.ruleId)).not.toContain("commandcode.mcp.invalid-transport");
  });

  test("type is an alias for transport on .mcp.json", () => {
    const root = tmpProject("agentscan-cc-mcp-type-");
    write(
      root,
      ".mcp.json",
      JSON.stringify({
        mcpServers: {
          remote: { type: "http", url: "https://example.com/mcp" },
          local: { type: "stdio", command: "npx" },
        },
      }),
    );
    const { facts, findings } = findingsFor(root);
    expect(facts.mcp.map((s) => s.transportField).sort()).toEqual(["type", "type"]);
    expect(findings.map((f) => f.ruleId)).toEqual([]);
  });

  test("Claude-only .claude/mcp.json with transport and no type is still url-without-type", () => {
    const root = tmpProject("agentscan-cc-claude-transport-");
    mkdirSync(join(root, ".claude"), { recursive: true });
    write(
      root,
      ".claude/mcp.json",
      JSON.stringify({
        mcpServers: { remote: { transport: "http", url: "https://example.com/mcp" } },
      }),
    );
    const { facts, findings } = findingsFor(root);
    expect(facts.mcp[0]!.schemaProfile).toBe("claude-json");
    expect(facts.mcp[0]!.transportField).toBe("transport");
    expect(findings.map((f) => f.ruleId)).toEqual(["claude.mcp.url-without-type"]);
  });

  test("unknown transport on .mcp.json is commandcode.mcp.invalid-transport", () => {
    const root = tmpProject("agentscan-cc-mcp-ftp-");
    write(
      root,
      ".mcp.json",
      JSON.stringify({ mcpServers: { x: { transport: "ftp", url: "ftp://example.com" } } }),
    );
    expect(ruleIds(root)).toContain("commandcode.mcp.invalid-transport");
  });

  test("Claude sse/ws on shared .mcp.json is not a Command Code invalid-transport", () => {
    const root = tmpProject("agentscan-cc-mcp-sse-");
    write(
      root,
      ".mcp.json",
      JSON.stringify({
        mcpServers: {
          sse: { type: "sse", url: "https://example.com/sse" },
          ws: { type: "ws", url: "wss://example.com/ws" },
        },
      }),
    );
    const ids = ruleIds(root);
    expect(ids).not.toContain("commandcode.mcp.invalid-transport");
    expect(ids).not.toContain("claude.mcp.url-without-type");
  });

  test("http without url and stdio without command", () => {
    const root = tmpProject("agentscan-cc-mcp-shape-");
    write(
      root,
      ".mcp.json",
      JSON.stringify({
        mcpServers: {
          remote: { transport: "http" },
          local: { transport: "stdio" },
        },
      }),
    );
    const ids = ruleIds(root);
    expect(ids).toContain("commandcode.mcp.http-without-url");
    expect(ids).toContain("commandcode.mcp.stdio-without-command");
  });

  test("inline mcp.servers array and unnamed items are inventory-only", () => {
    const root = tmpProject("agentscan-cc-inline-mcp-");
    write(
      root,
      ".commandcode/settings.json",
      JSON.stringify({
        mcp: {
          servers: [
            { name: "docs", transport: "http", url: "https://example.com/mcp" },
            { transport: "ftp" },
          ],
        },
      }),
    );
    const { facts, findings } = findingsFor(root);
    const named = facts.mcp.find((s) => s.name === "docs");
    const unnamed = facts.mcp.find((s) => s.inventoryOnly === true);
    expect(named?.schemaProfile).toBe("commandcode-json");
    expect(named?.commandcodeDefect).toBeUndefined();
    expect(unnamed).toBeDefined();
    expect(findings.map((f) => f.ruleId)).not.toContain("commandcode.mcp.invalid-transport");
  });
});

describe("Command Code agents", () => {
  test("filename supplies name; missing description is not an error", () => {
    const root = tmpProject("agentscan-cc-agent-fallback-");
    write(root, ".commandcode/agents/researcher.md", "Look things up.\n");
    const { facts, findings } = findingsFor(root);
    expect(facts.agents).toHaveLength(1);
    expect(facts.agents[0]!.name).toBe("researcher");
    expect(facts.agents[0]!.nameSource).toBe("filename");
    expect(facts.agents[0]!.sourceProvider).toBe("commandcode");
    const ids = findings.map((f) => f.ruleId);
    expect(ids).not.toContain("claude.agent.missing-name");
    expect(ids).not.toContain("claude.agent.missing-description");
    expect(ids).not.toContain("claude.agent.missing-frontmatter");
  });

  test("reserved names and invalid field types", () => {
    const root = tmpProject("agentscan-cc-agent-reserved-");
    write(root, ".commandcode/agents/explore.md", "---\ndescription: nope\n---\n");
    write(
      root,
      ".commandcode/agents/typed.md",
      "---\nname: typed\npermissionMode: yolo\nbackground: yes\n---\n",
    );
    const ids = ruleIds(root);
    expect(ids).toContain("commandcode.agent.reserved-name");
    expect(ids).toContain("commandcode.agent.invalid-permission-mode");
  });
});

describe("Command Code hooks", () => {
  test("four events, nested hooks, timeout bounds, and placeholders", () => {
    const root = tmpProject("agentscan-cc-hooks-");
    write(root, "scripts/ok.sh", "#!/bin/sh\nexit 0\n");
    write(
      root,
      ".commandcode/settings.json",
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              hooks: [
                {
                  type: "command",
                  command: "$COMMANDCODE_PROJECT_DIR/scripts/ok.sh",
                  timeout: 30,
                },
              ],
            },
          ],
          NotAnEvent: [{ hooks: [{ type: "command", command: "./scripts/ok.sh" }] }],
          Stop: [{ hooks: [{ type: "command", command: "./scripts/ok.sh", timeout: 601 }] }],
          SessionStart: [{ type: "command", command: "./scripts/ok.sh" }],
          PostToolUse: [{ hooks: [{ type: "http", url: "https://example.com" }] }],
        },
      }),
    );
    const ids = ruleIds(root);
    expect(ids).toContain("commandcode.hook.unknown-event");
    expect(ids).toContain("commandcode.hook.timeout-out-of-bounds");
    expect(ids).toContain("commandcode.hook.invalid-group");
    expect(ids).toContain("commandcode.hook.unknown-handler-type");
    expect(ids).not.toContain("claude.hook.unknown-event");
  });

  test("missing script is commandcode.hook.missing-script", () => {
    const root = tmpProject("agentscan-cc-hook-script-");
    write(
      root,
      ".commandcode/settings.json",
      JSON.stringify({
        hooks: {
          PreToolUse: [{ hooks: [{ type: "command", command: "./scripts/gone.sh" }] }],
        },
      }),
    );
    expect(ruleIds(root)).toContain("commandcode.hook.missing-script");
  });
});

describe("Command Code memory, skills, commands, mods", () => {
  test("at most one memory file per directory; AGENTS.md wins", () => {
    const root = tmpProject("agentscan-cc-memory-");
    write(root, "AGENTS.md", "root memory\n");
    write(root, ".commandcode/AGENTS.md", "hidden sibling\n");
    write(root, "packages/app/.commandcode/AGENTS.md", "nested cc memory\n");
    const startDir = join(root, "packages", "app");
    const facts = extractFacts(root, defaultConfig, { includeGlobal: false, startDir });
    const paths = facts.policyFiles.filter((f) => f.kind === "agents-md").map((f) => f.path);
    expect(paths).toContain(join(root, "AGENTS.md"));
    expect(paths).not.toContain(join(root, ".commandcode", "AGENTS.md"));
    expect(paths).toContain(join(root, "packages", "app", ".commandcode", "AGENTS.md"));
  });

  test("unresolved @path is not a hard error", () => {
    const root = tmpProject("agentscan-cc-atpath-");
    write(root, "AGENTS.md", "See @missing.md for details.\n");
    const ids = analyze({ dir: root }).findings
      .filter((f) => f.severity === "error" || f.severity === "warning")
      .map((f) => f.ruleId);
    expect(ids).toEqual([]);
  });

  test("highest settings layer replaces the skills array", () => {
    const root = tmpProject("agentscan-cc-extra-skills-");
    write(
      root,
      "from-local/alpha/SKILL.md",
      "---\nname: alpha\ndescription: From local settings.\n---\n",
    );
    write(
      root,
      "from-project/beta/SKILL.md",
      "---\nname: beta\ndescription: From project settings.\n---\n",
    );
    write(root, ".commandcode/settings.json", JSON.stringify({ skills: ["from-project"] }));
    write(root, ".commandcode/settings.local.json", JSON.stringify({ skills: ["from-local"] }));
    const { facts } = findingsFor(root);
    expect(facts.skills.map((s) => s.id).sort()).toEqual(["alpha"]);
    expect(facts.skills[0]!.schemaProfile).toBe("agent-skills");
  });

  test("slash commands are inventoried without required-field checks", () => {
    const root = tmpProject("agentscan-cc-commands-");
    write(root, ".commandcode/commands/ping.md", "pong\n");
    const { facts, findings } = findingsFor(root);
    expect(facts.slashCommands?.map((c) => c.name)).toEqual(["ping"]);
    expect(findings.map((f) => f.ruleId).filter((id) => id.includes("command"))).toEqual([]);
  });

  test("mods paths are inventoried and never executed", () => {
    const root = tmpProject("agentscan-cc-mods-");
    write(
      root,
      ".commandcode/settings.json",
      JSON.stringify({ mods: { paths: ["./mods/throws.ts"] } }),
    );
    write(root, "mods/throws.ts", "throw new Error('should not run');\n");
    const { facts, findings } = findingsFor(root);
    expect(facts.mods?.map((m) => m.path)).toEqual(["./mods/throws.ts"]);
    expect(findings.map((f) => f.ruleId)).toEqual([]);
  });

  test("never opens auth.json or mcp-tokens.json", () => {
    const root = tmpProject("agentscan-cc-noread-auth-");
    write(
      root,
      ".commandcode/auth.json",
      JSON.stringify({ token: "ghp_abcdefghij0123456789abcd" }),
    );
    write(
      root,
      ".commandcode/mcp-tokens.json",
      JSON.stringify({ token: "sk-ant-abcdefghijklmnopqrstuv" }),
    );
    write(
      root,
      ".mcp.json",
      JSON.stringify({ mcpServers: { ok: { command: "npx" } } }),
    );
    const ids = ruleIds(root);
    expect(ids).not.toContain("security.hardcoded-secret");
    expect(ids).not.toContain("config.unreadable");
  });
});

describe("Command Code --global user paths", () => {
  test("reads ~/.commandcode skills, agents, mcp, memory when HOME is isolated", () => {
    const tmpHome = mkdtempSync(join(os.tmpdir(), "agentscan-cc-home-"));
    const root = tmpProject("agentscan-cc-global-");
    write(
      tmpHome,
      ".commandcode/skills/global-skill/SKILL.md",
      "---\nname: global-skill\ndescription: User skill.\n---\n",
    );
    write(tmpHome, ".commandcode/agents/helper.md", "---\nname: helper\n---\n");
    write(
      tmpHome,
      ".commandcode/mcp.json",
      JSON.stringify({ mcpServers: { user: { transport: "http", url: "https://example.com/mcp" } } }),
    );
    write(tmpHome, ".commandcode/AGENTS.md", "user memory\n");
    write(tmpHome, ".commandcode/auth.json", JSON.stringify({ token: "ghp_abcdefghij0123456789abcd" }));

    const homedirSpy = spyOn(os, "homedir").mockReturnValue(tmpHome);
    try {
      const { facts, findings } = findingsFor(root, true);
      expect(facts.skills.some((s) => s.id === "global-skill" && s.source === "global")).toBe(true);
      expect(facts.agents.some((a) => a.name === "helper" && a.sourceProvider === "commandcode")).toBe(
        true,
      );
      expect(facts.mcp.some((s) => s.name === "user" && s.schemaProfile === "commandcode-json")).toBe(
        true,
      );
      expect(
        facts.policyFiles.some((p) => p.path === join(tmpHome, ".commandcode", "AGENTS.md")),
      ).toBe(true);
      expect(findings.map((f) => f.ruleId)).not.toContain("security.hardcoded-secret");
    } finally {
      homedirSpy.mockRestore();
    }
  });
});

describe("Command Code placeholders on MCP commands", () => {
  test("mcpCommandPath accepts COMMANDCODE_PROJECT_DIR and COMMANDCODE_CWD", () => {
    expect(mcpCommandPath("$COMMANDCODE_PROJECT_DIR/bin/server")).toBe(
      "$COMMANDCODE_PROJECT_DIR/bin/server",
    );
    expect(mcpCommandPath("$COMMANDCODE_CWD/bin/server")).toBe("$COMMANDCODE_CWD/bin/server");
  });
});
