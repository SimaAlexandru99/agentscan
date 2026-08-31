import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyze } from "../../src/analyze";
import { runChecks, STRUCTURAL_CHECKS } from "../../src/checks/index";
import { defaultConfig } from "../../src/config/schema";
import { extractFacts } from "../../src/facts/extract";
import type { Facts } from "../../src/facts/types";

function tmpProject(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  writeFileSync(join(root, "package.json"), '{"name":"correctness"}', "utf8");
  return root;
}

function write(root: string, rel: string, body: string): void {
  const abs = join(root, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, body, "utf8");
}

function ruleIds(dir: string): string[] {
  return analyze({ dir }).findings.map((finding) => finding.ruleId);
}

describe("Claude hook schema profile", () => {
  test("type is required and is not inferred from command", () => {
    const root = tmpProject("agentscan-claude-type-");
    write(
      root,
      ".claude/settings.json",
      JSON.stringify({
        hooks: {
          PreToolUse: [{ hooks: [{ command: "true" }] }],
        },
      }),
    );
    expect(ruleIds(root)).toContain("claude.hook.unknown-handler-type");
  });

  test("flat handler arrays are invalid groups", () => {
    const root = tmpProject("agentscan-claude-flat-");
    write(
      root,
      ".claude/settings.json",
      JSON.stringify({
        hooks: {
          PreToolUse: [{ type: "command", command: "true" }],
        },
      }),
    );
    expect(ruleIds(root)).toContain("claude.hook.invalid-group");
  });

  test("mcp_tool requires server and tool, not name", () => {
    const root = tmpProject("agentscan-claude-mcp-tool-");
    write(
      root,
      ".claude/settings.json",
      JSON.stringify({
        hooks: {
          PreToolUse: [{ hooks: [{ type: "mcp_tool", name: "other", toolName: "ping" }] }],
        },
      }),
    );
    expect(ruleIds(root)).toContain("claude.hook.mcp-tool-without-server-or-tool");
  });

  test("prompt and agent require prompt", () => {
    const root = tmpProject("agentscan-claude-prompt-");
    write(
      root,
      ".claude/settings.json",
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              hooks: [
                { type: "prompt" },
                { type: "agent" },
              ],
            },
          ],
        },
      }),
    );
    expect(ruleIds(root)).toContain("claude.hook.prompt-without-prompt");
  });

  test("http is incompatible with SessionStart", () => {
    const root = tmpProject("agentscan-claude-incompat-");
    write(
      root,
      ".claude/settings.json",
      JSON.stringify({
        hooks: {
          SessionStart: [{ hooks: [{ type: "http", url: "https://example.com" }] }],
        },
      }),
    );
    expect(ruleIds(root)).toContain("claude.hook.incompatible-handler");
  });
});

describe("VS Code native vs Copilot CLI hooks", () => {
  test("native VS Code files stay command-only", () => {
    const root = tmpProject("agentscan-vscode-http-");
    write(
      root,
      ".github/hooks/format.json",
      JSON.stringify({
        hooks: {
          PostToolUse: [{ type: "http", url: "https://example.com" }],
        },
      }),
    );
    const ids = ruleIds(root);
    expect(ids).toContain("vscode.hook.unknown-handler-type");
    expect(ids).not.toContain("vscode.hook.http-without-url");
    expect(ids).not.toContain("claude.hook.unknown-handler-type");
  });

  test("version:1 files are Copilot CLI and map camelCase events", () => {
    const root = tmpProject("agentscan-copilot-ok-");
    write(
      root,
      ".github/hooks/session.json",
      JSON.stringify({
        version: 1,
        hooks: {
          sessionStart: [{ bash: "echo hi" }],
        },
      }),
    );
    const facts = extractFacts(root, defaultConfig, { includeGlobal: false });
    expect(facts.hooks[0]!.schemaProfile).toBe("copilot-cli");
    expect(ruleIds(root)).not.toContain("vscode.hook.unknown-event");
    expect(ruleIds(root)).not.toContain("copilot.hook.unknown-event");
  });

  test("Copilot command hooks need bash, powershell, or command", () => {
    const root = tmpProject("agentscan-copilot-cmd-");
    write(
      root,
      ".github/hooks/empty.json",
      JSON.stringify({
        version: 1,
        hooks: {
          preToolUse: [{ type: "command", cwd: "." }],
        },
      }),
    );
    expect(ruleIds(root)).toContain("copilot.hook.command-without-command");
  });

  test("Copilot prompt is sessionStart-only", () => {
    const root = tmpProject("agentscan-copilot-prompt-");
    write(
      root,
      ".github/hooks/prompt.json",
      JSON.stringify({
        version: 1,
        hooks: {
          preToolUse: [{ type: "prompt", prompt: "hello" }],
        },
      }),
    );
    expect(ruleIds(root)).toContain("copilot.hook.incompatible-handler");
  });

  test("Copilot honors bash, cwd, and timeoutSec", () => {
    const root = tmpProject("agentscan-copilot-fields-");
    write(
      root,
      ".github/hooks/fields.json",
      JSON.stringify({
        version: 1,
        hooks: {
          preToolUse: [{ bash: "true", cwd: ".", timeoutSec: 15 }],
        },
      }),
    );
    const hook = extractFacts(root, defaultConfig, { includeGlobal: false }).hooks[0]!;
    expect(hook.schemaProfile).toBe("copilot-cli");
    expect(hook.timeout).toBe(15);
    expect(hook.cwd).toBe(".");
    expect(ruleIds(root)).not.toContain("copilot.hook.command-without-command");
    expect(ruleIds(root)).not.toContain("vscode.hook.unknown-handler-type");
  });

  test("camelCase without version:1 is not Copilot", () => {
    const root = tmpProject("agentscan-not-copilot-");
    write(
      root,
      ".github/hooks/camel.json",
      JSON.stringify({
        hooks: {
          sessionStart: [{ type: "command", command: "true" }],
        },
      }),
    );
    expect(ruleIds(root)).toContain("vscode.hook.unknown-event");
  });

  test("unknown Copilot event, missing script, and handler defects fire", () => {
    const root = tmpProject("agentscan-copilot-neg-");
    write(
      root,
      ".github/hooks/bad.json",
      JSON.stringify({
        version: 1,
        hooks: {
          notARealEvent: [{ bash: "true" }],
          sessionStart: [
            { type: "prompt" },
            { type: "http" },
            { type: "mcp_tool", server: "x", tool: "y" },
            { bash: "./gone-copilot.sh" },
          ],
        },
      }),
    );
    const ids = ruleIds(root);
    expect(ids).toContain("copilot.hook.unknown-event");
    expect(ids).toContain("copilot.hook.prompt-without-prompt");
    expect(ids).toContain("copilot.hook.http-without-url");
    expect(ids).toContain("copilot.hook.unknown-handler-type");
    expect(ids).toContain("copilot.hook.missing-script");
    expect(ids).not.toContain("vscode.hook.unknown-event");
    expect(ids).not.toContain("vscode.hook.missing-script");
  });

  test("timeoutSec wins over timeout", () => {
    const root = tmpProject("agentscan-copilot-timeout-");
    write(
      root,
      ".github/hooks/timeout.json",
      JSON.stringify({
        version: 1,
        hooks: {
          preToolUse: [{ bash: "true", timeout: 99, timeoutSec: 8 }],
        },
      }),
    );
    const hook = extractFacts(root, defaultConfig, { includeGlobal: false }).hooks[0]!;
    expect(hook.timeout).toBe(8);
  });
});

describe("Agent Skills optional fields and skill-root refs", () => {
  test("invalid compatibility, metadata, and allowed-tools fire", () => {
    const root = tmpProject("agentscan-as-optional-");
    write(
      root,
      ".agents/skills/bad-opt/SKILL.md",
      "---\nname: bad-opt\ndescription: Optional fields are wrong.\ncompatibility: true\nmetadata:\n  k: 1\nallowed-tools:\n  - Bash\n---\n\nBody.\n",
    );
    const ids = ruleIds(root);
    expect(ids).toContain("agent-skills.skill.invalid-compatibility");
    expect(ids).toContain("agent-skills.skill.invalid-metadata");
    expect(ids).toContain("agent-skills.skill.invalid-allowed-tools");
  });

  test("SKILL.md over 500 lines is an info recommendation", () => {
    const root = tmpProject("agentscan-as-lines-");
    const body = `${"line\n".repeat(501)}`;
    write(
      root,
      ".agents/skills/long-body/SKILL.md",
      `---\nname: long-body\ndescription: A long skill file.\n---\n\n${body}`,
    );
    const findings = analyze({ dir: root }).findings.filter(
      (f) => f.ruleId === "agent-skills.skill.body-too-large",
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("info");
  });

  test("Agent Skills references do not resolve from the repo root", () => {
    const root = tmpProject("agentscan-as-ref-");
    write(root, "references/guide.md", "at repo root\n");
    write(
      root,
      ".agents/skills/pointer/SKILL.md",
      "---\nname: pointer\ndescription: Points at a bundled file.\n---\n\nRead references/guide.md\n",
    );
    expect(ruleIds(root)).toContain("skill.broken-reference");
  });
});

describe("Claude skills description fallback and listing budget", () => {
  test("first markdown paragraph satisfies missing-description", () => {
    const root = tmpProject("agentscan-claude-para-");
    write(
      root,
      ".claude/skills/para/SKILL.md",
      "---\nname: para\n---\n\nThis paragraph describes the skill.\n",
    );
    expect(ruleIds(root)).not.toContain("claude.skill.missing-description");
  });

  test("no description and no paragraph is missing-description", () => {
    const root = tmpProject("agentscan-claude-nodesc-");
    write(root, ".claude/skills/empty/SKILL.md", "---\nname: empty\n---\n\n# Heading only\n");
    expect(ruleIds(root)).toContain("claude.skill.missing-description");
  });
});

describe("Claude agent names", () => {
  test("numbers are off-format warnings; colon is a skipped error", () => {
    const root = tmpProject("agentscan-agent-name-");
    write(
      root,
      ".claude/agents/reviewer2.md",
      "---\nname: reviewer2\ndescription: Reviews.\n---\n",
    );
    write(
      root,
      ".claude/agents/plug.md",
      "---\nname: plug:reviewer\ndescription: Plugin scoped.\n---\n",
    );
    const findings = analyze({ dir: root }).findings.filter(
      (f) => f.ruleId === "claude.agent.invalid-name",
    );
    const byName = Object.fromEntries(findings.map((f) => [f.subject, f.severity]));
    expect(byName["agent:reviewer2"]).toBe("warning");
    expect(byName["agent:plug"]).toBe("error");
  });

  test("filename is not compared to name", () => {
    const root = tmpProject("agentscan-agent-filename-");
    write(
      root,
      ".claude/agents/engineering-api-platform-engineer.md",
      "---\nname: api-platform-engineer\ndescription: Designs API platforms.\n---\n",
    );
    expect(ruleIds(root)).not.toContain("claude.agent.invalid-name");
  });
});

describe("OpenCode V2 command array, Continue YAML, Gemini underscore, Claude reserved MCP", () => {
  test("V2 local string command is command-not-array", () => {
    const root = tmpProject("agentscan-oc-str-");
    write(
      root,
      "opencode.jsonc",
      JSON.stringify({
        mcp: {
          servers: {
            docs: { type: "local", command: "npx -y mcp-server" },
          },
        },
      }),
    );
    expect(ruleIds(root)).toContain("opencode.mcp.command-not-array");
  });

  test("standalone YAML MCP blocks require name/version/schema", () => {
    const root = tmpProject("agentscan-continue-meta-");
    write(
      root,
      ".continue/mcpServers/docs.yaml",
      "mcpServers:\n  - uses: continuedev/continue-docs-mcp\n",
    );
    expect(ruleIds(root)).toContain("continue.mcp.missing-block-metadata");
  });

  test("copied JSON MCP configs do not require YAML block metadata", () => {
    const root = tmpProject("agentscan-continue-json-");
    write(
      root,
      ".continue/mcpServers/copied.json",
      JSON.stringify({
        mcpServers: [{ name: "docs", command: "npx", args: ["-y", "mcp"] }],
      }),
    );
    expect(ruleIds(root)).not.toContain("continue.mcp.missing-block-metadata");
  });

  test("Gemini underscore alias is a warning", () => {
    const root = tmpProject("agentscan-gemini-underscore-");
    write(
      root,
      ".gemini/settings.json",
      JSON.stringify({
        mcpServers: {
          my_server: { command: "npx", args: ["-y", "mcp"] },
        },
      }),
    );
    const findings = analyze({ dir: root }).findings.filter(
      (f) => f.ruleId === "gemini.mcp.underscore-alias",
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("warning");
  });

  test("Claude reserved MCP name workspace is skipped", () => {
    const root = tmpProject("agentscan-claude-workspace-");
    write(
      root,
      ".mcp.json",
      JSON.stringify({
        mcpServers: {
          workspace: { command: "npx", args: ["-y", "mcp"] },
        },
      }),
    );
    expect(ruleIds(root)).toContain("claude.mcp.reserved-name");
  });
});

describe("Codex AGENTS chain knobs", () => {
  test("fallback filename is used when AGENTS.md is absent", () => {
    const root = tmpProject("agentscan-codex-fallback-");
    write(root, ".git/HEAD", "ref: refs/heads/main\n");
    write(
      root,
      ".codex/config.toml",
      'project_doc_fallback_filenames = ["TEAM.md"]\n[mcp_servers.docs]\ncommand = "npx"\n',
    );
    write(root, "TEAM.md", "fallback instructions\n");
    write(root, "packages/app/notes.txt", "cwd\n");
    const facts = extractFacts(root, defaultConfig, {
      includeGlobal: false,
      startDir: join(root, "packages", "app"),
    });
    expect(facts.codexProjectDocFallbackFilenames).toEqual(["TEAM.md"]);
    expect(facts.policyFiles.some((f) => f.path.endsWith("TEAM.md"))).toBe(true);
  });

  test("empty project_root_markers makes cwd the Codex root", () => {
    const root = tmpProject("agentscan-codex-markers-");
    write(root, ".git/HEAD", "ref: refs/heads/main\n");
    write(root, ".codex/config.toml", "project_root_markers = []\n");
    write(root, "AGENTS.md", `${"x".repeat(40_000)}\n`);
    write(root, "packages/app/notes.txt", "cwd\n");
    const startDir = join(root, "packages", "app");
    const facts = extractFacts(root, defaultConfig, { includeGlobal: false, startDir });
    expect(facts.codexProjectRootMarkers).toEqual([]);
    expect(facts.codexProjectRoot).toBe(startDir);
    const findings = analyze({ dir: startDir }).findings;
    expect(findings.map((f) => f.ruleId)).not.toContain("codex.budget.instructions");
  });
});

describe("Remaining spec-required negative fixtures", () => {
  test("Claude http hook requires url", () => {
    const root = tmpProject("agentscan-claude-http-");
    write(
      root,
      ".claude/settings.json",
      JSON.stringify({
        hooks: {
          PreToolUse: [{ hooks: [{ type: "http" }] }],
        },
      }),
    );
    expect(ruleIds(root)).toContain("claude.hook.http-without-url");
  });

  test("native VS Code command hook requires command", () => {
    const root = tmpProject("agentscan-vscode-cmd-");
    write(
      root,
      ".github/hooks/format.json",
      JSON.stringify({
        hooks: {
          PostToolUse: [{ type: "command" }],
        },
      }),
    );
    expect(ruleIds(root)).toContain("vscode.hook.command-without-command");
  });

  test("Agent Skills required fields, name contract, and length limits", () => {
    const root = tmpProject("agentscan-as-required-");
    write(root, ".agents/skills/bare/SKILL.md", "Hello without frontmatter.\n");
    write(
      root,
      ".agents/skills/pdf/SKILL.md",
      "---\nname: PDF-Processing\ndescription: Extract text from PDFs.\n---\n\nBody.\n",
    );
    const longName = "a".repeat(65);
    write(
      root,
      `.agents/skills/${longName}/SKILL.md`,
      `---\nname: ${longName}\ndescription: Name exceeds sixty-four characters.\n---\n\nBody.\n`,
    );
    write(
      root,
      ".agents/skills/long-desc/SKILL.md",
      `---\nname: long-desc\ndescription: ${"x".repeat(1025)}\n---\n\nBody.\n`,
    );
    const ids = ruleIds(root);
    expect(ids).toContain("agent-skills.skill.missing-frontmatter");
    expect(ids).toContain("agent-skills.skill.invalid-name");
    expect(ids).toContain("agent-skills.skill.name-does-not-match-directory");
    expect(ids).toContain("agent-skills.skill.name-too-long");
    expect(ids).toContain("agent-skills.skill.description-too-long");
  });

  test("Claude agent missing name", () => {
    const root = tmpProject("agentscan-agent-noname-");
    write(root, ".claude/agents/reviewer.md", "---\ndescription: Reviews code.\n---\n");
    expect(ruleIds(root)).toContain("claude.agent.missing-name");
  });

  test("Claude agent duplicate name in one directory", () => {
    const root = tmpProject("agentscan-agent-dup-");
    write(root, ".claude/agents/a.md", "---\nname: twin\ndescription: First twin.\n---\n");
    write(root, ".claude/agents/b.md", "---\nname: twin\ndescription: Second twin.\n---\n");
    expect(ruleIds(root)).toContain("claude.agent.duplicate-name");
  });

  test("Continue config.yaml empty server is no-launch", () => {
    const root = tmpProject("agentscan-continue-empty-");
    write(root, ".continue/config.yaml", "mcpServers:\n  - name: dead\n");
    expect(ruleIds(root)).toContain("continue.mcp.no-launch");
  });

  test("Command Code settings mcp.servers empty is no-launch", () => {
    const root = tmpProject("agentscan-cc-mcp-empty-");
    write(
      root,
      ".commandcode/settings.json",
      JSON.stringify({ mcp: { servers: { dead: {} } } }),
    );
    expect(ruleIds(root)).toContain("commandcode.mcp.no-launch");
  });

  test("OpenCode no-launch is the check-layer fallback without a typed defect", () => {
    const facts: Facts = {
      root: "/tmp/proj",
      packageManager: "bun",
      dependencies: {},
      devDependencies: {},
      skills: [],
      agents: [],
      hooks: [],
      mcp: [
        {
          name: "dead",
          path: "/tmp/proj/opencode.json",
          schemaProfile: "opencode-json",
          sourceProvider: "opencode",
          hasCommand: false,
          hasUrl: false,
          literalEnvKeys: [],
          raw: "{}",
        },
      ],
      policyFiles: [],
      lockedSkills: [],
      hasSkillsLock: false,
      configErrors: [],
    };
    expect(runChecks(facts).map((finding) => finding.ruleId)).toContain("opencode.mcp.no-launch");
  });

  test("every spec-required check id is named in docs/spec", () => {
    const specDir = join(import.meta.dir, "../../docs/spec");
    const specText = readdirSync(specDir)
      .filter((name) => name.endsWith(".md"))
      .map((name) => readFileSync(join(specDir, name), "utf8"))
      .join("\n");
    const missing = STRUCTURAL_CHECKS.filter((check) => check.provenance === "spec-required")
      .map((check) => check.id)
      .filter((id) => {
        if (specText.includes(id)) {
          return false;
        }
        const wildcard = `${id.split(".").slice(0, -1).join(".")}.*`;
        return !specText.includes(wildcard);
      });
    expect(missing).toEqual([]);
  });
});
