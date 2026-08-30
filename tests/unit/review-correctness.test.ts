import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyze } from "../../src/analyze";
import { runChecks } from "../../src/checks/index";
import { runExplain } from "../../src/commands/explain";
import { defaultConfig } from "../../src/config/schema";
import { parseJsonc } from "../../src/discover/jsonc";
import { extractFacts } from "../../src/facts/extract";

function tmpProject(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  writeFileSync(join(root, "package.json"), '{"name":"review"}', "utf8");
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

describe("nested Agent Skills discovery", () => {
  test("nested .cursor/skills/category/skill is one skill, not a missing-md folder", () => {
    const root = tmpProject("agentscan-nested-cursor-");
    write(
      root,
      ".cursor/skills/frontend/deploy/SKILL.md",
      "---\nname: deploy\ndescription: Deploy the frontend.\n---\n",
    );
    const facts = extractFacts(root, defaultConfig, { includeGlobal: false });
    expect(facts.skills.map((skill) => skill.id)).toEqual(["deploy"]);
    expect(facts.skills[0]!.sourceProvider).toBe("cursor");
    expect(facts.skills[0]!.schemaProfile).toBe("agent-skills");
    expect(ruleIds(root)).not.toContain("skill.missing-skill-md");
  });

  test("nested package .cursor/skills and .agents/skills are discovered", () => {
    const root = tmpProject("agentscan-pkg-skills-");
    write(
      root,
      "packages/app/.cursor/skills/real-skill/SKILL.md",
      "---\nname: real-skill\ndescription: A nested Cursor skill.\n---\n",
    );
    write(
      root,
      "packages/app/.agents/skills/real-skill/SKILL.md",
      "---\nname: real-skill\ndescription: A nested Agent Skill.\n---\n",
    );
    const facts = extractFacts(root, defaultConfig, { includeGlobal: false });
    const ids = facts.skills.map((skill) => `${skill.sourceProvider}:${skill.id}`).sort();
    expect(ids).toEqual(["agent-skills:real-skill", "cursor:real-skill"]);
  });

  test("Cursor skill without name or description gets Agent Skills errors", () => {
    const root = tmpProject("agentscan-cursor-required-");
    write(root, ".cursor/skills/bare/SKILL.md", "---\nlicense: MIT\n---\n");
    const ids = ruleIds(root);
    expect(ids).toContain("agent-skills.skill.missing-name");
    expect(ids).toContain("agent-skills.skill.missing-description");
    expect(ids).not.toContain("claude.skill.missing-description");
  });

  test("non-string Agent Skills name and description are rejected", () => {
    const root = tmpProject("agentscan-yaml-types-");
    write(
      root,
      ".agents/skills/typed/SKILL.md",
      "---\nname: 123\ndescription: true\n---\n",
    );
    const facts = extractFacts(root, defaultConfig, { includeGlobal: false });
    expect(facts.skills[0]!.frontmatterName).toBeUndefined();
    expect(facts.skills[0]!.nameKind).toBe("number");
    expect(facts.skills[0]!.description).toBeUndefined();
    expect(facts.skills[0]!.descriptionKind).toBe("boolean");
    const ids = ruleIds(root);
    expect(ids).toContain("agent-skills.skill.missing-name");
    expect(ids).toContain("agent-skills.skill.missing-description");
  });
});

describe("Codex instruction chain", () => {
  test("same directory: only non-empty override counts", () => {
    const root = tmpProject("agentscan-codex-same-");
    write(root, "AGENTS.override.md", "o".repeat(20_000));
    write(root, "AGENTS.md", "n".repeat(20_000));
    const facts = extractFacts(root, defaultConfig, { includeGlobal: false });
    const findings = runChecks(facts, {
      budgets: { agentsMdLines: 150, claudeMdLines: 200, agents: 8, mcp: 5 },
    });
    expect(findings.map((finding) => finding.ruleId)).not.toContain(
      "codex.budget.instructions",
    );
  });

  test("root override plus child AGENTS.md are both on the chain", () => {
    const root = tmpProject("agentscan-codex-walk-");
    write(root, "AGENTS.override.md", "o".repeat(20_000));
    write(root, "packages/app/AGENTS.md", "n".repeat(20_000));
    const startDir = join(root, "packages", "app");
    const facts = extractFacts(root, defaultConfig, { includeGlobal: false, startDir });
    const findings = runChecks(facts, {
      budgets: { agentsMdLines: 150, claudeMdLines: 200, agents: 8, mcp: 5 },
    });
    expect(findings.map((finding) => finding.ruleId)).toContain("codex.budget.instructions");
  });

  test("empty override falls through to AGENTS.md", () => {
    const root = tmpProject("agentscan-codex-empty-");
    write(root, "AGENTS.override.md", "\n");
    write(root, "AGENTS.md", "keep\n");
    const facts = extractFacts(root, defaultConfig, { includeGlobal: false });
    const findings = runChecks(facts, {
      budgets: { agentsMdLines: 150, claudeMdLines: 200, agents: 8, mcp: 5 },
    });
    expect(findings.map((finding) => finding.ruleId)).not.toContain(
      "codex.budget.instructions",
    );
  });

  test("custom project_doc_max_bytes is honoured", () => {
    const root = tmpProject("agentscan-codex-custom-");
    mkdirSync(join(root, ".codex"), { recursive: true });
    writeFileSync(
      join(root, ".codex", "config.toml"),
      "project_doc_max_bytes = 65536\n",
      "utf8",
    );
    write(root, "AGENTS.md", "x".repeat(40_000));
    const facts = extractFacts(root, defaultConfig, { includeGlobal: false });
    expect(facts.codexProjectDocMaxBytes).toBe(65_536);
    const findings = runChecks(facts, {
      budgets: { agentsMdLines: 150, claudeMdLines: 200, agents: 8, mcp: 5 },
    });
    expect(findings.map((finding) => finding.ruleId)).not.toContain(
      "codex.budget.instructions",
    );
  });
});

describe("launch argv and OS overrides", () => {
  test("Claude hook command + args checks the script, not PATH node", () => {
    const root = tmpProject("agentscan-hook-args-");
    write(
      root,
      ".claude/settings.json",
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              hooks: [
                { type: "command", command: "node", args: ["./hooks/guard.js"] },
              ],
            },
          ],
        },
      }),
    );
    expect(ruleIds(root)).toContain("claude.hook.missing-script");
  });

  test("MCP command array path-checks the script argument", () => {
    const root = tmpProject("agentscan-mcp-argv-");
    write(
      root,
      ".mcp.json",
      JSON.stringify({
        mcpServers: {
          docs: { command: ["node", "./servers/mcp.js"] },
        },
      }),
    );
    const findings = analyze({ dir: root }).findings.filter(
      (finding) => finding.ruleId === "mcp.command-missing",
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("mcp.js");
  });

  test("VS Code hook OS overrides are path-checked only on the host platform", () => {
    const root = tmpProject("agentscan-vscode-os-");
    write(
      root,
      ".github/hooks/guard.json",
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              type: "command",
              command: "node",
              args: ["./hooks/default.js"],
              windows: { command: "node", args: ["./hooks/win.js"] },
              linux: { command: "node", args: ["./hooks/linux.js"] },
              osx: { command: "node", args: ["./hooks/mac.js"] },
            },
          ],
        },
      }),
    );
    const analysis = analyze({ dir: root });
    const subjects = analysis.findings
      .filter((finding) => finding.ruleId === "vscode.hook.missing-script")
      .map((finding) => finding.subject)
      .sort();
    const expected = ["hook:PreToolUse:./hooks/default.js"];
    if (process.platform === "linux") {
      expected.push("hook:PreToolUse:./hooks/linux.js");
    } else if (process.platform === "darwin") {
      expected.push("hook:PreToolUse:./hooks/mac.js");
    } else if (process.platform === "win32") {
      expected.push("hook:PreToolUse:./hooks/win.js");
    }
    expect(subjects).toEqual(expected.sort());
    const windows = analysis.facts.hooks.find((hook) => hook.platform === "windows");
    const osx = analysis.facts.hooks.find((hook) => hook.platform === "osx");
    const linux = analysis.facts.hooks.find((hook) => hook.platform === "linux");
    expect(windows?.command).toContain("win.js");
    expect(osx?.command).toContain("mac.js");
    expect(linux?.command).toContain("linux.js");
    if (process.platform !== "win32") {
      expect(windows?.scriptExists).toBeUndefined();
    }
    if (process.platform !== "darwin") {
      expect(osx?.scriptExists).toBeUndefined();
    }
    if (process.platform !== "linux") {
      expect(linux?.scriptExists).toBeUndefined();
    }
  });

  test("command type without command is a schema error", () => {
    const root = tmpProject("agentscan-hook-empty-");
    write(
      root,
      ".claude/settings.json",
      JSON.stringify({
        hooks: {
          PreToolUse: [{ hooks: [{ type: "command" }] }],
        },
      }),
    );
    expect(ruleIds(root)).toContain("claude.hook.command-without-command");
  });

  test("matcher without hooks is invalid-group", () => {
    const root = tmpProject("agentscan-hook-group-");
    write(
      root,
      ".claude/settings.json",
      JSON.stringify({
        hooks: {
          PreToolUse: [{ matcher: "Bash" }],
        },
      }),
    );
    expect(ruleIds(root)).toContain("claude.hook.invalid-group");
  });
});

describe("Continue, JSONC, scan boundary, explain aliases", () => {
  test("Continue mcpServers uses: is a registry reference, not no-launch", () => {
    const root = tmpProject("agentscan-continue-uses-");
    write(
      root,
      ".continue/mcpServers/docs.yaml",
      "name: Continue Docs\nversion: 0.0.1\nschema: v1\nmcpServers:\n  - uses: continuedev/continue-docs-mcp\n",
    );
    const facts = extractFacts(root, defaultConfig, { includeGlobal: false });
    expect(facts.mcp).toHaveLength(1);
    expect(facts.mcp[0]!.launchKind).toBe("registry-reference");
    expect(facts.mcp[0]!.uses).toBe("continuedev/continue-docs-mcp");
    expect(ruleIds(root)).not.toContain("continue.mcp.no-launch");
  });

  test("OpenCode JSONC with comments and trailing commas parses", () => {
    const root = tmpProject("agentscan-jsonc-");
    write(
      root,
      "opencode.jsonc",
      `{
        // line comment
        /* block comment */
        "mcp": {
          "docs": {
            "type": "remote",
            "url": "https://example.com/mcp",
          },
        },
      }\n`,
    );
    expect(ruleIds(root)).toEqual([]);
    expect(analyze({ dir: root }).facts.mcp[0]!.hasUrl).toBe(true);
  });

  test("child .cursor does not hide parent Claude or Codex", () => {
    const root = tmpProject("agentscan-scan-bound-");
    mkdirSync(join(root, ".git"), { recursive: true });
    write(root, "CLAUDE.md", "repo memory\n");
    write(root, ".claude/settings.json", JSON.stringify({ hooks: {} }));
    write(root, ".codex/config.toml", '[mcp_servers.docs]\nurl = "https://example.com/mcp"\n');
    const child = join(root, "apps", "web");
    write(child, ".cursor/mcp.json", JSON.stringify({ mcpServers: { ui: { command: "npx" } } }));
    const analysis = analyze({ dir: child });
    expect(analysis.facts.policyFiles.some((file) => file.path.endsWith("CLAUDE.md"))).toBe(
      true,
    );
    expect(analysis.facts.mcp.some((server) => server.schemaProfile === "codex-toml")).toBe(
      true,
    );
    expect(analysis.facts.mcp.some((server) => server.schemaProfile === "cursor-json")).toBe(
      true,
    );
  });

  test("old finding id works in explain", async () => {
    const root = tmpProject("agentscan-explain-alias-");
    write(
      root,
      ".claude/settings.json",
      JSON.stringify({
        hooks: {
          PreToolUse: [
            { hooks: [{ type: "command", command: "node", args: ["./guard.js"] }] },
          ],
        },
      }),
    );
    const result = await runExplain("hook.missing-script:hook:PreToolUse:./guard.js", {
      dir: root,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("claude.hook.missing-script:hook:PreToolUse:./guard.js");
  });
});

describe("parseJsonc", () => {
  test("accepts comments, trailing commas, URLs, and escaped quotes", () => {
    const value = parseJsonc(`{
      // line
      /* block */
      "url": "https://example.com/mcp",
      "quote": "say \\"hi\\"",
      "list": [1, 2,],
    }`) as Record<string, unknown>;
    expect(value.url).toBe("https://example.com/mcp");
    expect(value.quote).toBe('say "hi"');
    expect(value.list).toEqual([1, 2]);
  });

  test("rejects an unterminated comment", () => {
    expect(() => parseJsonc("{ /* unterminated")).toThrow();
  });
});
