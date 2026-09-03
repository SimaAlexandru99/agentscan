import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runChecks } from "../../src/checks/index";
import { defaultConfig } from "../../src/config/schema";
import { extractFacts } from "../../src/facts/extract";
import { mkPinnedProject } from "../helpers/tmp";

function write(root: string, rel: string, body: string): void {
  const abs = join(root, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, body, "utf8");
}

function script(root: string, rel: string): void {
  write(root, rel, "#!/bin/sh\nexit 0\n");
  chmodSync(join(root, rel), 0o755);
}

function scan(root: string) {
  const facts = extractFacts(root, defaultConfig);
  return { facts, ruleIds: runChecks(facts).map((f) => f.ruleId) };
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

  test("every documented event name is accepted", () => {
    const root = mkPinnedProject("agentscan-gemini-hooks-all-", "gemini-hooks");
    script(root, ".gemini/hooks/x.sh");
    const events = [
      "SessionStart",
      "SessionEnd",
      "BeforeAgent",
      "AfterAgent",
      "BeforeModel",
      "AfterModel",
      "BeforeToolSelection",
      "BeforeTool",
      "AfterTool",
      "PreCompress",
      "Notification",
    ];
    const hooks = Object.fromEntries(
      events.map((event) => [
        event,
        [{ hooks: [{ type: "command", command: ".gemini/hooks/x.sh" }] }],
      ]),
    );
    write(root, ".gemini/settings.json", JSON.stringify({ hooks }));
    expect(scan(root).ruleIds.filter((id) => id.startsWith("gemini.hook."))).toEqual([]);
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

  test("every documented event name is accepted", () => {
    const root = mkPinnedProject("agentscan-cursor-hooks-all-", "cursor-hooks");
    script(root, ".cursor/hooks/x.sh");
    const events = [
      "sessionStart",
      "sessionEnd",
      "preToolUse",
      "postToolUse",
      "postToolUseFailure",
      "subagentStart",
      "subagentStop",
      "beforeShellExecution",
      "afterShellExecution",
      "beforeMCPExecution",
      "afterMCPExecution",
      "beforeReadFile",
      "afterFileEdit",
      "beforeSubmitPrompt",
      "preCompact",
      "stop",
      "afterAgentResponse",
      "afterAgentThought",
      "beforeTabFileRead",
      "afterTabFileEdit",
      "workspaceOpen",
    ];
    const hooks = Object.fromEntries(
      events.map((event) => [event, [{ command: ".cursor/hooks/x.sh" }]]),
    );
    write(root, ".cursor/hooks.json", JSON.stringify({ version: 1, hooks }));
    expect(scan(root).ruleIds.filter((id) => id.startsWith("cursor.hook."))).toEqual([]);
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
});
