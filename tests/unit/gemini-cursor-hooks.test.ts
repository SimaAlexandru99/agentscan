import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkPinnedProject, write } from "../helpers/tmp";
import { withHome } from "../helpers/env";
import { findingsFor } from "../helpers/scan";

function script(root: string, rel: string): void {
  write(root, rel, "#!/bin/sh\nexit 0\n");
  chmodSync(join(root, rel), 0o755);
}

function scan(root: string, includeGlobal = false) {
  const analysis = findingsFor(root, includeGlobal);
  return { facts: analysis.facts, ruleIds: analysis.findings.map((f) => f.ruleId) };
}

describe("Gemini hooks in .gemini/settings.json", () => {
  test("documented events and $GEMINI_PROJECT_DIR scripts are clean", () => {
    const root = mkPinnedProject("agentscan-gemini-hooks-ok-", "gemini-hooks");
    script(root, ".gemini/hooks/security.sh");
    script(root, ".gemini/hooks/validate.sh");
    write(
      root,
      ".gemini/settings.json",
      JSON.stringify({
        hooks: {
          BeforeTool: [
            {
              matcher: "write_file|replace",
              hooks: [
                {
                  name: "security-check",
                  type: "command",
                  command: "$GEMINI_PROJECT_DIR/.gemini/hooks/security.sh",
                  timeout: 5000,
                },
              ],
            },
          ],
          AfterAgent: [
            {
              matcher: "*",
              sequential: true,
              hooks: [{ type: "command", command: ".gemini/hooks/validate.sh" }],
            },
          ],
        },
      }),
    );
    const { facts, ruleIds } = scan(root);
    expect(facts.hooks.filter((h) => h.schemaProfile === "gemini")).toHaveLength(2);
    expect(ruleIds.filter((id) => id.startsWith("gemini.hook."))).toEqual([]);
  });

  test("a comment in settings.json still yields hooks (JSONC, same as the MCP reader)", () => {
    const root = mkPinnedProject("agentscan-gemini-hooks-jsonc-", "gemini-hooks");
    script(root, ".gemini/hooks/x.sh");
    write(
      root,
      ".gemini/settings.json",
      `{
  // Gemini CLI accepts comments in settings.json
  "hooks": {
    "BeforeTool": [{ "matcher": "*", "hooks": [{ "type": "command", "command": ".gemini/hooks/x.sh" }] }]
  }
}
`,
    );
    const { facts } = scan(root);
    expect(facts.hooks.filter((h) => h.schemaProfile === "gemini")).toHaveLength(1);
    expect(facts.configErrors.filter((e) => e.kind === "invalid-json")).toEqual([]);
  });

  test("Claude event names are not Gemini event names", () => {
    const root = mkPinnedProject("agentscan-gemini-hooks-claude-", "gemini-hooks");
    script(root, ".gemini/hooks/x.sh");
    write(
      root,
      ".gemini/settings.json",
      JSON.stringify({
        hooks: {
          PreToolUse: [{ hooks: [{ type: "command", command: ".gemini/hooks/x.sh" }] }],
          PreCompact: [{ hooks: [{ type: "command", command: ".gemini/hooks/x.sh" }] }],
        },
      }),
    );
    const ruleIds = scan(root).ruleIds;
    expect(ruleIds.filter((id) => id === "gemini.hook.unknown-event")).toHaveLength(2);
    expect(ruleIds).not.toContain("claude.hook.unknown-event");
  });

  test("missing type, wrong type, no command, and a dead script each report", () => {
    const root = mkPinnedProject("agentscan-gemini-hooks-bad-", "gemini-hooks");
    write(
      root,
      ".gemini/settings.json",
      JSON.stringify({
        hooks: {
          BeforeTool: [{ hooks: [{ command: ".gemini/hooks/x.sh" }] }],
          AfterTool: [{ hooks: [{ type: "http", url: "https://example.com" }] }],
          BeforeAgent: [{ hooks: [{ type: "command" }] }],
          SessionStart: [{ hooks: [{ type: "command", command: ".gemini/hooks/gone.sh" }] }],
        },
      }),
    );
    const ruleIds = scan(root).ruleIds;
    expect(ruleIds).toContain("gemini.hook.unknown-handler-type");
    expect(ruleIds).toContain("gemini.hook.command-without-command");
    expect(ruleIds).toContain("gemini.hook.missing-script");
    expect(ruleIds.filter((id) => id === "gemini.hook.unknown-handler-type")).toHaveLength(2);
  });

  test("$GEMINI_PROJECT_DIR scripts are existence-checked", () => {
    const root = mkPinnedProject("agentscan-gemini-hooks-placeholder-", "gemini-hooks");
    script(root, ".gemini/hooks/present.sh");
    const settings = (command: string) =>
      JSON.stringify({ hooks: { BeforeTool: [{ hooks: [{ type: "command", command }] }] } });
    write(root, ".gemini/settings.json", settings("$GEMINI_PROJECT_DIR/.gemini/hooks/missing.sh"));
    expect(scan(root).ruleIds).toContain("gemini.hook.missing-script");
    write(root, ".gemini/settings.json", settings("${GEMINI_PROJECT_DIR}/.gemini/hooks/present.sh"));
    const { facts, ruleIds } = scan(root);
    expect(facts.hooks.find((h) => h.schemaProfile === "gemini")?.scriptExists).toBe(true);
    expect(ruleIds).not.toContain("gemini.hook.missing-script");
  });

  test("a group without a nested hooks array is invalid", () => {
    const root = mkPinnedProject("agentscan-gemini-hooks-group-", "gemini-hooks");
    write(
      root,
      ".gemini/settings.json",
      JSON.stringify({
        hooks: { BeforeTool: [{ type: "command", command: "echo hi" }] },
      }),
    );
    expect(scan(root).ruleIds).toContain("gemini.hook.invalid-group");
  });

  test("a settings file with MCP but no hooks produces no hook facts", () => {
    const root = mkPinnedProject("agentscan-gemini-hooks-none-", "gemini-hooks");
    write(
      root,
      ".gemini/settings.json",
      JSON.stringify({ mcpServers: { docs: { command: "npx", args: ["-y", "srv"] } } }),
    );
    const { facts, ruleIds } = scan(root);
    expect(facts.hooks).toEqual([]);
    expect(ruleIds.filter((id) => id.startsWith("gemini.hook."))).toEqual([]);
  });
});

describe("Cursor hooks in .cursor/hooks.json", () => {
  test("documented events and project-root relative scripts are clean", () => {
    const root = mkPinnedProject("agentscan-cursor-hooks-ok-", "cursor-hooks");
    script(root, ".cursor/hooks/validate-tool.sh");
    script(root, ".cursor/hooks/audit.sh");
    write(
      root,
      ".cursor/hooks.json",
      JSON.stringify({
        version: 1,
        hooks: {
          preToolUse: [{ command: ".cursor/hooks/validate-tool.sh", matcher: "Shell|Read" }],
          stop: [{ command: ".cursor/hooks/audit.sh", loop_limit: 10 }],
        },
      }),
    );
    const { facts, ruleIds } = scan(root);
    expect(facts.hooks.filter((h) => h.schemaProfile === "cursor")).toHaveLength(2);
    expect(ruleIds.filter((id) => id.startsWith("cursor.hook."))).toEqual([]);
  });

  test("an absent type is a command hook, not a missing required type", () => {
    const root = mkPinnedProject("agentscan-cursor-hooks-notype-", "cursor-hooks");
    script(root, ".cursor/hooks/x.sh");
    write(
      root,
      ".cursor/hooks.json",
      JSON.stringify({ version: 1, hooks: { preToolUse: [{ command: ".cursor/hooks/x.sh" }] } }),
    );
    const { facts, ruleIds } = scan(root);
    expect(facts.hooks[0]?.handlerType).toBe("command");
    expect(ruleIds).not.toContain("cursor.hook.unknown-handler-type");
    expect(ruleIds).not.toContain("claude.hook.unknown-handler-type");
  });

  test("prompt is an accepted type but still needs a command", () => {
    const root = mkPinnedProject("agentscan-cursor-hooks-prompt-", "cursor-hooks");
    script(root, ".cursor/hooks/x.sh");
    write(
      root,
      ".cursor/hooks.json",
      JSON.stringify({
        version: 1,
        hooks: {
          preToolUse: [{ type: "prompt", command: ".cursor/hooks/x.sh" }],
          postToolUse: [{ type: "prompt" }],
        },
      }),
    );
    const ruleIds = scan(root).ruleIds;
    expect(ruleIds).not.toContain("cursor.hook.unknown-handler-type");
    expect(ruleIds).toContain("cursor.hook.command-without-command");
  });

  test("Claude PascalCase names are not Cursor event names", () => {
    const root = mkPinnedProject("agentscan-cursor-hooks-pascal-", "cursor-hooks");
    script(root, ".cursor/hooks/x.sh");
    write(
      root,
      ".cursor/hooks.json",
      JSON.stringify({
        version: 1,
        hooks: { PreToolUse: [{ command: ".cursor/hooks/x.sh" }] },
      }),
    );
    const ruleIds = scan(root).ruleIds;
    expect(ruleIds).toContain("cursor.hook.unknown-event");
    expect(ruleIds).not.toContain("claude.hook.unknown-event");
  });

  test("the documented wrong relative base is reported as a dead script", () => {
    const root = mkPinnedProject("agentscan-cursor-hooks-base-", "cursor-hooks");
    script(root, ".cursor/hooks/script.sh");
    write(
      root,
      ".cursor/hooks.json",
      // Quoted counter-example: "./hooks/script.sh (which would look for
      // <project>/hooks/script.sh)".
      JSON.stringify({ version: 1, hooks: { preToolUse: [{ command: "./hooks/script.sh" }] } }),
    );
    expect(scan(root).ruleIds).toContain("cursor.hook.missing-script");
  });

  test("an unknown type reports, and a non-object entry needs a command", () => {
    const root = mkPinnedProject("agentscan-cursor-hooks-bad-", "cursor-hooks");
    write(
      root,
      ".cursor/hooks.json",
      JSON.stringify({
        version: 1,
        hooks: {
          preToolUse: [{ type: "http", command: "./x.sh" }],
          postToolUse: ["./x.sh"],
        },
      }),
    );
    const ruleIds = scan(root).ruleIds;
    expect(ruleIds).toContain("cursor.hook.unknown-handler-type");
    expect(ruleIds).toContain("cursor.hook.command-without-command");
  });

  test("a .cursor/mcp.json project keeps producing no hook facts", () => {
    const root = mkPinnedProject("agentscan-cursor-hooks-none-", "cursor-hooks");
    write(
      root,
      ".cursor/mcp.json",
      JSON.stringify({ mcpServers: { docs: { command: "npx", args: ["-y", "srv"] } } }),
    );
    expect(scan(root).facts.hooks).toEqual([]);
  });

  test("user ~/.cursor/mcp.json is --global only and version is not a finding", () => {
    const root = mkPinnedProject("agentscan-cursor-user-mcp-", "cursor-mcp");
    const home = mkdtempSync(join(tmpdir(), "agentscan-cursor-home-"));
    write(
      home,
      ".cursor/mcp.json",
      JSON.stringify({
        mcpServers: {
          docs: { command: "npx", args: ["-y", "srv"] },
          empty: {},
        },
      }),
    );
    withHome(home, () => {
      const off = scan(root, false);
      expect(off.facts.mcp.some((server) => server.name === "docs")).toBe(false);
      const on = scan(root, true);
      const docs = on.facts.mcp.find((server) => server.name === "docs");
      expect(docs?.schemaProfile).toBe("cursor-json");
      expect(docs?.path).toBe(join(home, ".cursor", "mcp.json"));
      expect(on.ruleIds).toContain("cursor.mcp.no-launch");
      expect(on.ruleIds.some((id) => id.includes("version"))).toBe(false);
    });
  });
});

describe("hook dedupe", () => {
  test("--global scan of $HOME reads ~/.claude/settings.json once", () => {
    const home = mkPinnedProject("agentscan-hooks-home-", "home");
    write(
      home,
      ".claude/settings.json",
      JSON.stringify({
        hooks: { PreToolUse: [{ hooks: [{ type: "command", command: "node ./gone.mjs" }] }] },
      }),
    );
    withHome(home, () => {
      const { facts, ruleIds } = scan(home, true);
      expect(facts.hooks.filter((h) => h.sourceProvider === "claude")).toHaveLength(1);
      expect(ruleIds.filter((id) => id === "claude.hook.missing-script")).toHaveLength(1);
    });
  });
});

describe(".gemini/settings.json read by the hooks and MCP readers", () => {
  test("a malformed file is one config error, not one per reader", () => {
    const root = mkPinnedProject("agentscan-gemini-bad-json-", "gemini-bad-json");
    write(root, ".gemini/settings.json", "{ not json");
    const { facts } = scan(root);
    expect(facts.configErrors.filter((e) => e.path.endsWith("settings.json"))).toHaveLength(1);
  });

  test("a non-object root is one shape error, not one per reader", () => {
    const root = mkPinnedProject("agentscan-gemini-array-", "gemini-array");
    write(root, ".gemini/settings.json", "[]");
    const { facts } = scan(root);
    expect(facts.configErrors.filter((e) => e.path.endsWith("settings.json"))).toHaveLength(1);
  });
});
