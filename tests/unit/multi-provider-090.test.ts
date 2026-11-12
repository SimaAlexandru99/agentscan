import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { scanContext, tmpProject, write } from "../helpers/tmp";
import { analyze } from "../../src/analyze";
import { runChecks } from "../../src/checks/index";
import { defaultConfig } from "../../src/config/schema";
import { extractFacts } from "../../src/discover/extract";

describe("instruction hierarchy", () => {
  test("nested AGENTS.md is found and the nearest file is tagged", () => {
    const root = tmpProject("agentscan-agents-md-");
    write(root, "AGENTS.md", "root instructions\n");
    write(root, "packages/app/AGENTS.md", "package instructions\n");
    const startDir = join(root, "packages", "app");
    const facts = extractFacts(scanContext(root, { startDir }), defaultConfig);
    const agentsMd = facts.policyFiles.filter((f) => f.kind === "agents-md");
    expect(agentsMd.map((f) => f.path).sort()).toEqual(
      [join(root, "AGENTS.md"), join(startDir, "AGENTS.md")].sort(),
    );
    const nearest = agentsMd.filter((f) => f.nearest);
    expect(nearest).toHaveLength(1);
    expect(nearest[0]!.path).toBe(join(startDir, "AGENTS.md"));
    expect(nearest[0]!.hopsFromStart).toBe(0);
  });

  test("Codex 32 KiB chain is info and is not applied to CLAUDE.md", () => {
    const root = tmpProject("agentscan-codex-budget-");
    write(root, "AGENTS.md", "x".repeat(33_000));
    write(root, "CLAUDE.md", "keep this short\n");
    const facts = extractFacts(scanContext(root, { startDir: root }), defaultConfig);
    const findings = runChecks(facts, { thresholds: defaultConfig.thresholds });
    expect(findings.map((f) => f.ruleId)).toContain("codex.budget.instructions");
    expect(findings.find((f) => f.ruleId === "codex.budget.instructions")!.severity).toBe(
      "info",
    );
    expect(findings.map((f) => f.ruleId)).not.toContain("budget.claude-md");
  });
});

describe("multi-provider agents", () => {
  test("walk-up finds a child .claude/agents directory", () => {
    const root = tmpProject("agentscan-walkup-agents-");
    write(
      root,
      "packages/app/.claude/agents/reviewer.md",
      "---\nname: reviewer\ndescription: Reviews code\n---\n",
    );
    const startDir = join(root, "packages", "app");
    const facts = extractFacts(scanContext(root, { startDir }), defaultConfig);
    expect(facts.agents.map((a) => a.name)).toEqual(["reviewer"]);
    expect(facts.agents[0]!.sourceProvider).toBe("claude");
  });

  test("VS Code agent without frontmatter name is not a Claude missing-name error", () => {
    const root = tmpProject("agentscan-vscode-agent-");
    write(root, ".github/agents/helper.agent.md", "Help with the repo.\n");
    const analysis = analyze({ dir: root });
    expect(analysis.facts.agents).toHaveLength(1);
    expect(analysis.facts.agents[0]!.sourceProvider).toBe("vscode");
    expect(analysis.facts.agents[0]!.name).toBe("helper");
    expect(analysis.facts.agents[0]!.nameSource).toBe("filename");
    expect(analysis.findings.map((f) => f.ruleId)).not.toContain("claude.agent.missing-name");
    expect(analysis.findings.map((f) => f.ruleId)).not.toContain(
      "claude.agent.missing-frontmatter",
    );
  });

  test("duplicate Claude names are scoped to one agents directory", () => {
    const root = tmpProject("agentscan-dup-agents-");
    write(
      root,
      ".claude/agents/a.md",
      "---\nname: twin\ndescription: Root twin\n---\n",
    );
    write(
      root,
      "packages/app/.claude/agents/b.md",
      "---\nname: twin\ndescription: Nested twin\n---\n",
    );
    const startDir = join(root, "packages", "app");
    const facts = extractFacts(scanContext(root, { startDir }), defaultConfig);
    expect(facts.agents).toHaveLength(2);
    expect(runChecks(facts, { thresholds: defaultConfig.thresholds }).map((f) => f.ruleId)).not.toContain("claude.agent.duplicate-name");
  });
});

describe("provider hooks", () => {
  test("Claude http/prompt/agent/mcp_tool handlers do not emit missing-script", () => {
    const root = tmpProject("agentscan-hook-types-");
    write(
      root,
      ".claude/settings.json",
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              hooks: [
                { type: "http", url: "https://example.com/hook" },
                { type: "prompt", prompt: "Review this" },
                { type: "agent", prompt: "Review as the reviewer agent" },
                { type: "mcp_tool", server: "other", tool: "ping" },
              ],
            },
          ],
        },
      }),
    );
    expect(analyze({ dir: root }).findings.map((f) => f.ruleId)).not.toContain(
      "claude.hook.missing-script",
    );
  });

  test("command array [node, hook.js] still reports a missing script", () => {
    const root = tmpProject("agentscan-hook-argv-");
    write(
      root,
      ".claude/settings.json",
      JSON.stringify({
        hooks: {
          PreToolUse: [{ hooks: [{ type: "command", command: ["node", "hook.js"] }] }],
        },
      }),
    );
    const findings = analyze({ dir: root }).findings.filter(
      (f) => f.ruleId === "claude.hook.missing-script",
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("hook.js");
  });

  test("a VS Code-only event is not claude.hook.unknown-event", () => {
    const root = tmpProject("agentscan-vscode-hook-");
    write(
      root,
      ".github/hooks/session.json",
      JSON.stringify({
        hooks: {
          SessionStart: [{ type: "command", command: "npx prettier --write ." }],
        },
      }),
    );
    const findings = analyze({ dir: root }).findings;
    expect(findings.map((f) => f.ruleId)).not.toContain("claude.hook.unknown-event");
    expect(findings.map((f) => f.ruleId)).not.toContain("vscode.hook.unknown-event");
  });

  test("an unknown VS Code event uses the vscode check id", () => {
    const root = tmpProject("agentscan-vscode-unknown-hook-");
    write(
      root,
      ".github/hooks/bad.json",
      JSON.stringify({
        hooks: {
          PostToolBatch: [{ type: "command", command: "npx prettier --write ." }],
        },
      }),
    );
    expect(analyze({ dir: root }).findings.map((f) => f.ruleId)).toEqual([
      "vscode.hook.unknown-event",
    ]);
  });
});

describe("rules surfaces", () => {
  test("a short official-shaped Cursor rule produces zero errors", () => {
    const root = tmpProject("agentscan-cursor-rule-ok-");
    write(root, ".cursor/rules/style.mdc", "---\ndescription: Style\n---\nUse the project style.\n");
    const findings = analyze({ dir: root }).findings.filter(
      (f) => f.severity === "error" || f.severity === "warning",
    );
    expect(findings).toEqual([]);
  });

  test("a Cursor rule over 500 lines is one info finding", () => {
    const root = tmpProject("agentscan-cursor-rule-big-");
    write(root, ".cursor/rules/big.mdc", `${"line\n".repeat(501)}`);
    const findings = analyze({ dir: root }).findings.filter(
      (f) => f.ruleId === "cursor.rule.too-large",
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("info");
  });
});

describe("remaining MCP profiles", () => {
  test("Gemini httpUrl is launchable; empty entry is gemini.mcp.no-launch", () => {
    const root = tmpProject("agentscan-gemini-mcp-");
    write(
      root,
      ".gemini/settings.json",
      JSON.stringify({
        mcpServers: {
          remote: { httpUrl: "https://example.com/mcp" },
          dead: {},
        },
      }),
    );
    const findings = analyze({ dir: root }).findings;
    expect(findings.map((f) => f.ruleId)).toEqual(["gemini.mcp.no-launch"]);
    expect(findings.map((f) => f.ruleId)).not.toContain("claude.mcp.url-without-type");
  });

  test("Continue YAML url without type is not a Claude false positive", () => {
    const root = tmpProject("agentscan-continue-mcp-");
    write(
      root,
      ".continue/config.yaml",
      `mcpServers:\n  - name: docs\n    url: https://example.com/mcp\n`,
    );
    expect(analyze({ dir: root }).findings.map((f) => f.ruleId)).toEqual([]);
  });

  test("OpenCode V2 empty server emits missing-type, not a generic no-launch", () => {
    const root = tmpProject("agentscan-opencode-dead-");
    write(
      root,
      "opencode.json",
      JSON.stringify({ mcp: { servers: { dead: {} } } }),
    );
    expect(analyze({ dir: root }).findings.map((f) => f.ruleId)).toEqual([
      "opencode.mcp.missing-type",
    ]);
  });
});
