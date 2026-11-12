import { describe, expect, test } from "bun:test";
import { tmpProject, write } from "../helpers/tmp";
import { ruleIds } from "../helpers/scan";

/**
 * Regression tests for the 2026-09-02 re-verification of every check against
 * the live official pages (docs/spec/check-inventory.md). Each block pins one
 * false positive that the scanner emitted on a documented, working
 * configuration, and keeps the genuinely invalid neighbour firing.
 */

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
  const portable = (name: string) => {
    const root = tmpProject("agentscan-skill-name-");
    write(root, `.agents/skills/${name}/SKILL.md`, `---\nname: ${name}\ndescription: d.\n---\n# Skill\n`);
    return ruleIds(root);
  };

  test.each(["pdf-processing", "résumé-builder", "日本語", "data2-analysis"])("%s is a valid name", (name) => {
    const ids = portable(name);
    expect(ids).not.toContain("agent-skills.skill.invalid-name");
    expect(ids).not.toContain("agent-skills.skill.name-does-not-match-directory");
  });

  test.each(["PDF-Processing", "Résumé", "-pdf", "pdf-", "pdf--processing", "pdf_processing", "pdf processing"])(
    "%s is an invalid name",
    (name) => {
      expect(portable(name)).toContain("agent-skills.skill.invalid-name");
    },
  );
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
});
