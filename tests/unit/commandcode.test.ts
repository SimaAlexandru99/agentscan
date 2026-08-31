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
  test("project-root AGENTS.md wins over sibling .commandcode/AGENTS.md", () => {
    const root = tmpProject("agentscan-cc-memory-");
    write(root, "AGENTS.md", "root memory\n");
    write(root, ".commandcode/AGENTS.md", "hidden sibling\n");
    write(root, "packages/app/AGENTS.md", "nested dir memory\n");
    write(root, "packages/app/.commandcode/AGENTS.md", "nested sibling hidden\n");
    const startDir = join(root, "packages", "app");
    const facts = extractFacts(root, defaultConfig, { includeGlobal: false, startDir });
    const paths = facts.policyFiles.filter((f) => f.kind === "agents-md").map((f) => f.path);
    expect(paths).toContain(join(root, "AGENTS.md"));
    expect(paths).not.toContain(join(root, ".commandcode", "AGENTS.md"));
    expect(paths).toContain(join(root, "packages", "app", "AGENTS.md"));
    expect(paths).not.toContain(join(root, "packages", "app", ".commandcode", "AGENTS.md"));
  });

  test("nested .commandcode/AGENTS.md is memory when that directory has no AGENTS.md", () => {
    const root = tmpProject("agentscan-cc-memory-fallback-");
    write(root, ".commandcode/AGENTS.md", "project fallback\n");
    write(root, "packages/app/.commandcode/AGENTS.md", "nested fallback\n");
    const startDir = join(root, "packages", "app");
    const facts = extractFacts(root, defaultConfig, { includeGlobal: false, startDir });
    const paths = facts.policyFiles.filter((f) => f.kind === "agents-md").map((f) => f.path);
    expect(paths).toContain(join(root, ".commandcode", "AGENTS.md"));
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

describe("Command Code project root is the git root", () => {
  test("child .cursor does not hide git-root .commandcode settings", () => {
    const repo = tmpProject("agentscan-cc-gitroot-settings-");
    mkdirSync(join(repo, ".git"));
    write(repo, ".commandcode/settings.json", JSON.stringify({ model: "from-git-root" }));
    write(repo, "apps/web/.commandcode/settings.json", JSON.stringify({ model: "from-child" }));
    mkdirSync(join(repo, "apps", "web", ".cursor"), { recursive: true });
    const result = analyze({ dir: join(repo, "apps", "web") });
    expect(result.facts.commandcodeProjectRoot).toBe(repo);
    expect(result.facts.root).toBe(join(repo, "apps", "web"));
    expect(result.facts.commandcodeModel).toBe("from-git-root");
    expect(result.facts.commandcodeModelSource).toBe(join(repo, ".commandcode", "settings.json"));
  });

  test("nested package .commandcode/agents and skills are not project config", () => {
    const repo = tmpProject("agentscan-cc-nested-pkg-");
    mkdirSync(join(repo, ".git"));
    write(repo, ".commandcode/agents/root-agent.md", "---\nname: root-agent\n---\n");
    write(
      repo,
      ".commandcode/skills/root-skill/SKILL.md",
      "---\nname: root-skill\ndescription: From git root.\n---\n",
    );
    write(repo, "packages/pkg/package.json", '{"name":"pkg"}');
    write(repo, "packages/pkg/.commandcode/agents/nested-agent.md", "---\nname: nested-agent\n---\n");
    write(
      repo,
      "packages/pkg/.commandcode/skills/nested-skill/SKILL.md",
      "---\nname: nested-skill\ndescription: Must not load as Command Code project config.\n---\n",
    );
    const fromRoot = analyze({ dir: repo });
    const fromPkg = analyze({ dir: join(repo, "packages", "pkg") });
    for (const result of [fromRoot, fromPkg]) {
      expect(result.facts.commandcodeProjectRoot).toBe(repo);
      expect(result.facts.agents.map((a) => a.name)).toEqual(["root-agent"]);
      expect(result.facts.skills.map((s) => s.id).sort()).toEqual(["root-skill"]);
    }
  });

  test(".agents/skills more than 10 hops from cwd is not Command Code project config", () => {
    const repo = tmpProject("agentscan-cc-agents-hops-");
    mkdirSync(join(repo, ".git"));
    write(
      repo,
      ".agents/skills/deep/SKILL.md",
      "---\nname: deep\ndescription: At the git root, 11 hops up.\n---\n",
    );
    let dir = repo;
    for (let i = 0; i < 11; i++) {
      dir = join(dir, `d${i}`);
      mkdirSync(dir);
    }
    mkdirSync(join(dir, ".cursor"));
    write(
      dir,
      ".agents/skills/near/SKILL.md",
      "---\nname: near\ndescription: At cwd, hop 0.\n---\n",
    );
    const result = analyze({ dir });
    const deep = result.facts.skills.find((s) => s.id === "deep");
    const near = result.facts.skills.find((s) => s.id === "near");
    expect(deep).toBeDefined();
    expect(deep?.commandcodeEffective).toBeUndefined();
    expect(near?.commandcodeEffective).toBe(true);
  });
});

describe("Command Code strict HookEntry schema", () => {
  test("missing type, command array, numeric type, and non-string matcher fail", () => {
    const root = tmpProject("agentscan-cc-hook-shape-");
    write(root, "scripts/ok.sh", "#!/bin/sh\nexit 0\n");
    write(
      root,
      ".commandcode/settings.json",
      JSON.stringify({
        hooks: {
          PreToolUse: [{ hooks: [{ command: "./scripts/ok.sh" }] }],
          PostToolUse: [
            { hooks: [{ type: "command", command: ["node", "./scripts/ok.sh"] }] },
          ],
          Stop: [{ hooks: [{ type: 123, command: "./scripts/ok.sh" }] }],
          SessionStart: [
            { matcher: ["Bash"], hooks: [{ type: "command", command: "./scripts/ok.sh" }] },
          ],
        },
      }),
    );
    const { facts, findings } = findingsFor(root);
    const ids = findings.map((f) => f.ruleId);
    expect(ids).toContain("commandcode.hook.unknown-handler-type");
    expect(ids).toContain("commandcode.hook.command-without-command");
    expect(ids).toContain("commandcode.hook.invalid-group");
    const missing = facts.hooks.find((h) => h.event === "PreToolUse");
    expect(missing?.unknownHandlerType).toBe("(missing)");
    const arrayCmd = facts.hooks.find((h) => h.event === "PostToolUse");
    expect(arrayCmd?.defect).toBe("command-without-command");
    const numeric = facts.hooks.find((h) => h.event === "Stop");
    expect(numeric?.defect).toBe("unknown-handler-type");
    const matcher = facts.hooks.find((h) => h.commandcodeInvalidMatcher === true);
    expect(matcher?.event).toBe("SessionStart");
  });

  test("Stop and SessionStart with a string matcher are not a schema error", () => {
    const root = tmpProject("agentscan-cc-hook-matcher-runtime-");
    write(root, "scripts/ok.sh", "#!/bin/sh\nexit 0\n");
    write(
      root,
      ".commandcode/settings.json",
      JSON.stringify({
        hooks: {
          Stop: [
            { matcher: "*", hooks: [{ type: "command", command: "./scripts/ok.sh" }] },
          ],
          SessionStart: [
            { matcher: "startup", hooks: [{ type: "command", command: "./scripts/ok.sh" }] },
          ],
        },
      }),
    );
    expect(ruleIds(root)).toEqual([]);
  });
});

describe("Command Code agent field types", () => {
  test("covers every documented typed field", () => {
    const root = tmpProject("agentscan-cc-agent-types-");
    write(root, ".commandcode/agents/desc.md", "---\nname: desc\ndescription: 123\n---\n");
    write(root, ".commandcode/agents/model.md", "---\nname: model\nmodel: 123\n---\n");
    write(root, ".commandcode/agents/zero.md", "---\nname: zero\nmaxTurns: 0\n---\n");
    write(root, ".commandcode/agents/neg.md", "---\nname: neg\nmaxTurns: -1\n---\n");
    write(
      root,
      ".commandcode/agents/bg.md",
      '---\nname: bg\nbackground: "yes"\n---\n',
    );
    const { facts, findings } = findingsFor(root);
    const byName = Object.fromEntries(facts.agents.map((a) => [a.name, a]));
    expect(byName.desc?.invalidField).toBe("description");
    expect(byName.model?.invalidField).toBe("model");
    expect(byName.zero?.invalidField).toBe("maxTurns");
    expect(byName.neg?.invalidField).toBe("maxTurns");
    expect(byName.bg?.invalidField).toBe("background");
    expect(findings.filter((f) => f.ruleId === "commandcode.agent.invalid-field-type")).toHaveLength(
      5,
    );
  });

  test("unknown agent frontmatter keys including reasoningEffort are not typed", () => {
    const root = tmpProject("agentscan-cc-agent-unknown-key-");
    write(
      root,
      ".commandcode/agents/effort.md",
      "---\nname: effort\nreasoningEffort: false\n---\n",
    );
    const { facts, findings } = findingsFor(root);
    expect(facts.agents[0]!.invalidField).toBeUndefined();
    expect(findings.map((f) => f.ruleId)).not.toContain("commandcode.agent.invalid-field-type");
  });

  test("filename fallback for missing name remains valid", () => {
    const root = tmpProject("agentscan-cc-agent-name-fallback-");
    write(root, ".commandcode/agents/ok.md", "---\ndescription: still valid\n---\n");
    const { facts, findings } = findingsFor(root);
    expect(facts.agents[0]!.name).toBe("ok");
    expect(facts.agents[0]!.nameSource).toBe("filename");
    expect(findings.map((f) => f.ruleId)).not.toContain("commandcode.agent.invalid-field-type");
  });
});

describe("Command Code effective vs shadowed config", () => {
  test("valid project .mcp.json shadows a broken settings mcp.servers entry", () => {
    const root = tmpProject("agentscan-cc-mcp-shadow-");
    write(
      root,
      ".commandcode/settings.json",
      JSON.stringify({
        mcp: {
          servers: [
            {
              name: "shared",
              transport: "stdio",
              env: { TOKEN: "ghp_abcdefghij0123456789abcd" },
            },
          ],
        },
      }),
    );
    write(
      root,
      ".mcp.json",
      JSON.stringify({ mcpServers: { shared: { transport: "stdio", command: "npx" } } }),
    );
    const { facts, findings } = findingsFor(root);
    const ids = findings.map((f) => f.ruleId);
    expect(ids).not.toContain("commandcode.mcp.stdio-without-command");
    expect(ids).toContain("security.hardcoded-secret");
    const settings = facts.mcp.find((s) => s.path.includes("settings.json"));
    const project = facts.mcp.find((s) => s.path.endsWith(".mcp.json"));
    expect(settings?.commandcodeEffective).toBe(false);
    expect(project?.commandcodeEffective).toBe(true);
  });

  test("settings.local replaces the same hook event from project settings", () => {
    const root = tmpProject("agentscan-cc-hook-shadow-");
    write(root, "scripts/ok.sh", "#!/bin/sh\nexit 0\n");
    write(
      root,
      ".commandcode/settings.json",
      JSON.stringify({
        hooks: {
          PreToolUse: [{ hooks: [{ command: "./scripts/ok.sh" }] }],
          PostToolUse: [{ hooks: [{ type: "command", command: "./scripts/ok.sh" }] }],
        },
      }),
    );
    write(
      root,
      ".commandcode/settings.local.json",
      JSON.stringify({
        hooks: {
          PreToolUse: [{ hooks: [{ type: "command", command: "./scripts/ok.sh" }] }],
        },
      }),
    );
    const { facts, findings } = findingsFor(root);
    expect(findings.map((f) => f.ruleId)).not.toContain("commandcode.hook.unknown-handler-type");
    const localPre = facts.hooks.filter(
      (h) => h.path.endsWith("settings.local.json") && h.event === "PreToolUse",
    );
    const projectPre = facts.hooks.filter(
      (h) =>
        h.path.endsWith("settings.json") &&
        !h.path.endsWith("settings.local.json") &&
        h.event === "PreToolUse",
    );
    const projectPost = facts.hooks.filter(
      (h) =>
        h.path.endsWith("settings.json") &&
        !h.path.endsWith("settings.local.json") &&
        h.event === "PostToolUse",
    );
    expect(localPre.every((h) => h.commandcodeEffective === true)).toBe(true);
    expect(projectPre.every((h) => h.commandcodeEffective === false)).toBe(true);
    expect(projectPost.every((h) => h.commandcodeEffective === true)).toBe(true);
  });

  test("distinct project and user PreToolUse hooks both stay effective", () => {
    const tmpHome = mkdtempSync(join(os.tmpdir(), "agentscan-cc-hook-coexist-home-"));
    const root = tmpProject("agentscan-cc-hook-coexist-");
    write(root, "scripts/project.sh", "#!/bin/sh\nexit 0\n");
    write(
      root,
      ".commandcode/settings.json",
      JSON.stringify({
        hooks: {
          PreToolUse: [{ hooks: [{ type: "command", command: "./scripts/project.sh" }] }],
        },
      }),
    );
    write(
      tmpHome,
      ".commandcode/settings.json",
      JSON.stringify({
        hooks: {
          PreToolUse: [{ hooks: [{ type: "command", command: "./missing-user.sh" }] }],
        },
      }),
    );
    const homedirSpy = spyOn(os, "homedir").mockReturnValue(tmpHome);
    try {
      const { facts, findings } = findingsFor(root, true);
      const project = facts.hooks.find(
        (h) => h.command === "./scripts/project.sh" && h.commandcodeSettingsLayer === "project",
      );
      const user = facts.hooks.find(
        (h) => h.command === "./missing-user.sh" && h.commandcodeSettingsLayer === "user",
      );
      expect(project?.commandcodeEffective).toBe(true);
      expect(user?.commandcodeEffective).toBe(true);
      expect(findings.map((f) => f.ruleId)).toContain("commandcode.hook.missing-script");
      expect(
        findings.some(
          (f) =>
            f.ruleId === "commandcode.hook.missing-script" &&
            f.evidence.some((e) => e.value.includes(tmpHome)),
        ),
      ).toBe(true);
    } finally {
      homedirSpy.mockRestore();
    }
  });

  test("exact duplicate command keeps the higher-priority project hook", () => {
    const tmpHome = mkdtempSync(join(os.tmpdir(), "agentscan-cc-hook-dup-home-"));
    const root = tmpProject("agentscan-cc-hook-dup-");
    write(root, "scripts/shared.sh", "#!/bin/sh\nexit 0\n");
    const hooks = {
      PreToolUse: [{ hooks: [{ type: "command", command: "./scripts/shared.sh" }] }],
    };
    write(root, ".commandcode/settings.json", JSON.stringify({ hooks }));
    write(tmpHome, ".commandcode/settings.json", JSON.stringify({ hooks }));
    const homedirSpy = spyOn(os, "homedir").mockReturnValue(tmpHome);
    try {
      const { facts, findings } = findingsFor(root, true);
      const project = facts.hooks.find((h) => h.commandcodeSettingsLayer === "project");
      const user = facts.hooks.find((h) => h.commandcodeSettingsLayer === "user");
      expect(project?.command).toBe("./scripts/shared.sh");
      expect(user?.command).toBe("./scripts/shared.sh");
      expect(project?.commandcodeEffective).toBe(true);
      expect(user?.commandcodeEffective).toBe(false);
      expect(findings.map((f) => f.ruleId)).not.toContain("commandcode.hook.missing-script");
    } finally {
      homedirSpy.mockRestore();
    }
  });

  test("personal agent shadows a broken project agent of the same name", () => {
    const tmpHome = mkdtempSync(join(os.tmpdir(), "agentscan-cc-agent-shadow-home-"));
    const root = tmpProject("agentscan-cc-agent-shadow-");
    write(tmpHome, ".commandcode/agents/dup.md", "---\nname: dup\ndescription: personal\n---\n");
    write(root, ".commandcode/agents/dup.md", "---\nname: dup\nmaxTurns: 0\n---\n");
    const homedirSpy = spyOn(os, "homedir").mockReturnValue(tmpHome);
    try {
      const { facts, findings } = findingsFor(root, true);
      expect(findings.map((f) => f.ruleId)).not.toContain("commandcode.agent.invalid-field-type");
      const personal = facts.agents.find((a) => a.path.startsWith(tmpHome));
      const project = facts.agents.find((a) => a.path.startsWith(root));
      expect(personal?.commandcodeEffective).toBe(true);
      expect(project?.commandcodeEffective).toBe(false);
    } finally {
      homedirSpy.mockRestore();
    }
  });

  test("project .commandcode skill shadows a broken extra of the same id", () => {
    const root = tmpProject("agentscan-cc-skill-shadow-");
    write(
      root,
      ".commandcode/skills/dup/SKILL.md",
      "---\nname: dup\ndescription: Project copy wins.\n---\n",
    );
    write(root, "extra/dup/SKILL.md", "---\nname: dup\n---\n");
    write(root, ".commandcode/settings.json", JSON.stringify({ skills: ["extra"] }));
    const { facts, findings } = findingsFor(root);
    expect(findings.map((f) => f.ruleId)).not.toContain("agent-skills.skill.missing-description");
    const project = facts.skills.find((s) => s.path.includes(`${join(".commandcode", "skills")}`));
    const extra = facts.skills.find((s) => s.path.includes(`${join("extra", "dup")}`));
    expect(project?.commandcodeEffective).toBe(true);
    expect(extra?.commandcodeEffective).toBe(false);
  });
});
