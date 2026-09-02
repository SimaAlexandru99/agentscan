import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyze } from "../../src/analyze";
import { isValidAgentSkillsName } from "../../src/checks/skills";
import { COPILOT_HOOK_EVENTS, COPILOT_PASCAL_ALIASES } from "../../src/facts/hook-schema";

/**
 * Regression tests for the 2026-09-02 re-verification of every check against
 * the live official pages (docs/spec/check-inventory.md). Each block pins one
 * false positive that the scanner emitted on a documented, working
 * configuration, and keeps the genuinely invalid neighbour firing.
 */

function tmpProject(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  writeFileSync(join(root, "package.json"), '{"name":"reverify"}', "utf8");
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

describe("Claude MCP `streamable-http` alias (code.claude.com/docs/en/mcp)", () => {
  test("streamable-http on shared .mcp.json is not a Command Code invalid-transport", () => {
    const root = tmpProject("agentscan-streamable-http-");
    write(
      root,
      ".mcp.json",
      JSON.stringify({
        mcpServers: {
          notion: { type: "streamable-http", url: "https://mcp.notion.com/mcp" },
        },
      }),
    );
    const ids = ruleIds(root);
    expect(ids).not.toContain("commandcode.mcp.invalid-transport");
    expect(ids).not.toContain("claude.mcp.url-without-type");
    expect(ids).not.toContain("claude.mcp.no-launch");
  });

  test("an undocumented transport on shared .mcp.json still fires", () => {
    const root = tmpProject("agentscan-ftp-transport-");
    write(
      root,
      ".mcp.json",
      JSON.stringify({ mcpServers: { odd: { type: "ftp", url: "ftp://example.com" } } }),
    );
    expect(ruleIds(root)).toContain("commandcode.mcp.invalid-transport");
  });
});

describe("Command Code SSE tolerance (commandcode.ai/docs/mcp)", () => {
  test("sse on a Command Code-only file is skipped rather than flagged", () => {
    const root = tmpProject("agentscan-cc-sse-");
    write(
      root,
      ".commandcode/settings.json",
      JSON.stringify({
        mcp: {
          servers: [{ name: "legacy", transport: "sse", url: "https://mcp.example.com/sse" }],
        },
      }),
    );
    expect(ruleIds(root)).not.toContain("commandcode.mcp.invalid-transport");
  });

  test("http without url on a Command Code-only file still fires", () => {
    const root = tmpProject("agentscan-cc-http-nourl-");
    write(
      root,
      ".commandcode/settings.json",
      JSON.stringify({ mcp: { servers: [{ name: "broken", transport: "http" }] } }),
    );
    expect(ruleIds(root)).toContain("commandcode.mcp.http-without-url");
  });
});

describe("Agent Skills Unicode names (agentskills.io/specification, skills-ref)", () => {
  test("isValidAgentSkillsName accepts lowercase letters in any script", () => {
    expect(isValidAgentSkillsName("pdf-processing")).toBe(true);
    expect(isValidAgentSkillsName("résumé-builder")).toBe(true);
    expect(isValidAgentSkillsName("日本語")).toBe(true);
    expect(isValidAgentSkillsName("data2-analysis")).toBe(true);
  });

  test("isValidAgentSkillsName still rejects the documented invalid shapes", () => {
    expect(isValidAgentSkillsName("PDF-Processing")).toBe(false);
    expect(isValidAgentSkillsName("Résumé")).toBe(false);
    expect(isValidAgentSkillsName("-pdf")).toBe(false);
    expect(isValidAgentSkillsName("pdf-")).toBe(false);
    expect(isValidAgentSkillsName("pdf--processing")).toBe(false);
    expect(isValidAgentSkillsName("pdf_processing")).toBe(false);
    expect(isValidAgentSkillsName("pdf processing")).toBe(false);
    expect(isValidAgentSkillsName("")).toBe(false);
  });

  test("a lowercase accented portable skill is not reported as an invalid name", () => {
    const root = tmpProject("agentscan-unicode-skill-");
    write(
      root,
      ".agents/skills/résumé-builder/SKILL.md",
      "---\nname: résumé-builder\ndescription: Builds résumés.\n---\n# Skill\n",
    );
    const ids = ruleIds(root);
    expect(ids).not.toContain("agent-skills.skill.invalid-name");
    expect(ids).not.toContain("agent-skills.skill.name-does-not-match-directory");
  });

  test("an uppercase portable skill name is still an invalid name", () => {
    const root = tmpProject("agentscan-upper-skill-");
    write(
      root,
      ".agents/skills/Bad-Name/SKILL.md",
      "---\nname: Bad-Name\ndescription: Uppercase.\n---\n# Skill\n",
    );
    expect(ruleIds(root)).toContain("agent-skills.skill.invalid-name");
  });
});

describe("Copilot CLI exec form (docs.github.com/en/copilot/reference/hooks-reference)", () => {
  test("exec + args is a complete command handler", () => {
    const root = tmpProject("agentscan-copilot-exec-");
    write(
      root,
      ".github/hooks/guard.json",
      JSON.stringify({
        version: 1,
        hooks: {
          preToolUse: [{ type: "command", exec: "my-guard", args: ["--strict"] }],
        },
      }),
    );
    const ids = ruleIds(root);
    expect(ids).not.toContain("copilot.hook.command-without-command");
    expect(ids).not.toContain("copilot.hook.unknown-event");
  });

  test("exec pointing at a missing local script is still reported", () => {
    const root = tmpProject("agentscan-copilot-exec-missing-");
    write(
      root,
      ".github/hooks/guard.json",
      JSON.stringify({
        version: 1,
        hooks: {
          preToolUse: [{ type: "command", exec: "./scripts/gone.sh" }],
        },
      }),
    );
    expect(ruleIds(root)).toContain("copilot.hook.missing-script");
  });

  test("a command handler with none of bash, powershell, command, or exec still fires", () => {
    const root = tmpProject("agentscan-copilot-empty-");
    write(
      root,
      ".github/hooks/guard.json",
      JSON.stringify({
        version: 1,
        hooks: { preToolUse: [{ type: "command", cwd: "." }] },
      }),
    );
    expect(ruleIds(root)).toContain("copilot.hook.command-without-command");
  });
});

describe("Copilot CLI PascalCase aliases for Copilot-only events", () => {
  test("the alias table names only Copilot-only events, never native VS Code ones", () => {
    expect(Object.keys(COPILOT_PASCAL_ALIASES).sort()).toEqual([
      "ErrorOccurred",
      "PermissionRequest",
      "PostToolUseFailure",
      "SessionEnd",
    ]);
    for (const alias of Object.keys(COPILOT_PASCAL_ALIASES)) {
      expect(COPILOT_HOOK_EVENTS.has(alias)).toBe(true);
    }
  });

  test("documented PascalCase spellings in a version: 1 file are known events", () => {
    const root = tmpProject("agentscan-copilot-pascal-");
    write(
      root,
      ".github/hooks/lifecycle.json",
      JSON.stringify({
        version: 1,
        hooks: {
          SessionEnd: [{ type: "command", bash: "echo bye" }],
          PostToolUseFailure: [{ type: "command", bash: "echo failed" }],
          ErrorOccurred: [{ type: "command", bash: "echo err" }],
          PermissionRequest: [{ type: "command", bash: "echo perm" }],
        },
      }),
    );
    expect(ruleIds(root)).not.toContain("copilot.hook.unknown-event");
  });

  test("the same PascalCase names on a native VS Code file are still unknown", () => {
    const root = tmpProject("agentscan-vscode-pascal-");
    write(
      root,
      ".github/hooks/lifecycle.json",
      JSON.stringify({
        hooks: {
          SessionEnd: [{ type: "command", command: "echo bye" }],
        },
      }),
    );
    expect(ruleIds(root)).toContain("vscode.hook.unknown-event");
  });

  test("a misspelt Copilot event is still unknown", () => {
    const root = tmpProject("agentscan-copilot-typo-");
    write(
      root,
      ".github/hooks/typo.json",
      JSON.stringify({
        version: 1,
        hooks: { sessionEnded: [{ type: "command", bash: "echo bye" }] },
      }),
    );
    expect(ruleIds(root)).toContain("copilot.hook.unknown-event");
  });
});

describe("Gemini CLI Windows env interpolation (`%VAR%`)", () => {
  test("a %VAR% value on a secret-named env key is interpolation, not a literal", () => {
    const root = tmpProject("agentscan-gemini-percent-");
    write(
      root,
      ".gemini/settings.json",
      JSON.stringify({
        mcpServers: {
          gh: { command: "npx", args: ["-y", "x"], env: { GITHUB_TOKEN: "%GITHUB_TOKEN%" } },
        },
      }),
    );
    expect(ruleIds(root)).not.toContain("mcp.literal-env");
  });

  test("a bare literal on a secret-named env key still fires", () => {
    const root = tmpProject("agentscan-gemini-literal-");
    write(
      root,
      ".gemini/settings.json",
      JSON.stringify({
        mcpServers: {
          gh: { command: "npx", args: ["-y", "x"], env: { GITHUB_TOKEN: "not-a-reference" } },
        },
      }),
    );
    expect(ruleIds(root)).toContain("mcp.literal-env");
  });
});

describe("Command Code agent permissionMode: inherit (commandcode.ai/docs/agents)", () => {
  test("the documented default value is accepted when written explicitly", () => {
    const root = tmpProject("agentscan-cc-inherit-");
    write(
      root,
      ".commandcode/agents/researcher.md",
      "---\nname: researcher\ndescription: Researches\npermissionMode: inherit\n---\nbody\n",
    );
    expect(ruleIds(root)).not.toContain("commandcode.agent.invalid-permission-mode");
  });

  test("an undocumented permissionMode still fires", () => {
    const root = tmpProject("agentscan-cc-yolo-");
    write(
      root,
      ".commandcode/agents/researcher.md",
      "---\nname: researcher\ndescription: Researches\npermissionMode: yolo\n---\nbody\n",
    );
    expect(ruleIds(root)).toContain("commandcode.agent.invalid-permission-mode");
  });
});
