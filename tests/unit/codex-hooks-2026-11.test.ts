import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { mkPinnedProject, mkPinnedRoot, write } from "../helpers/tmp";
import { findings, findingsFor, ruleIds } from "../helpers/scan";
import { withEnv, withHome } from "../helpers/env";

const NESTED = {
  hooks: {
    PreToolUse: [
      {
        matcher: "Bash",
        hooks: [{ type: "command", command: "echo from-json" }],
      },
    ],
  },
};

describe("Codex hooks.json and inline config.toml hooks", () => {
  test("both files in one layer are inventoried, and MCP in the toml still parses", () => {
    const root = mkPinnedProject("agentscan-codex-hooks-");
    write(root, ".codex/hooks.json", JSON.stringify(NESTED));
    write(
      root,
      ".codex/config.toml",
      `
project_doc_max_bytes = 1000

[features]
hooks = false

[mcp_servers.docs]
command = "npx"

[[hooks.SessionStart]]
matcher = "^compact$"

[[hooks.SessionStart.hooks]]
type = "command"
command = "echo from-toml"
`,
    );
    const analysis = findingsFor(root);
    const events = analysis.facts.hooks
      .filter((hook) => hook.schemaProfile === "codex")
      .map((hook) => hook.event)
      .sort();
    expect(events).toEqual(["PreToolUse", "SessionStart"]);
    expect(analysis.facts.mcp.some((server) => server.schemaProfile === "codex-toml" && server.name === "docs")).toBe(
      true,
    );
    expect(ruleIds(root)).not.toContain("codex.hook.unknown-event");
    expect(analysis.facts.configErrors.filter((err) => err.path.endsWith("config.toml"))).toEqual([]);
  });

  test("a parent .codex/hooks.json is opened from a nested start directory", () => {
    const root = mkPinnedProject("agentscan-codex-walk-");
    write(root, ".codex/hooks.json", JSON.stringify(NESTED));
    write(root, "nested/keep.txt", "x");
    const hooks = findingsFor(root, false, join(root, "nested")).facts.hooks;
    expect(hooks.some((hook) => hook.schemaProfile === "codex" && hook.event === "PreToolUse")).toBe(true);
  });

  test("prompt and agent are skipped, SessionEnd rejects mcp_tool, and a missing type is unknown", () => {
    const root = mkPinnedProject("agentscan-codex-types-");
    write(
      root,
      ".codex/hooks.json",
      JSON.stringify({
        hooks: {
          Stop: [{ hooks: [{ type: "prompt", prompt: "why" }, {}] }],
          SubagentStop: [{ hooks: [{ type: "agent", prompt: "go" }] }],
          SessionEnd: [{ hooks: [{ type: "mcp_tool", server: "scanner", tool: "scan" }] }],
          PreToolUse: [{ hooks: [{ type: "http", url: "https://example.invalid" }] }],
          PostToolUse: [{ hooks: [{ type: "mcp_tool", server: "scanner" }] }],
          UserPromptSubmit: [{ type: "command", command: "echo flat" }],
        },
      }),
    );
    const found = findings(root);
    expect(found.filter((item) => item.ruleId === "codex.hook.incompatible-handler").map((item) => item.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("prompt handler is parsed but skipped"),
        expect.stringContaining("agent handler is parsed but skipped"),
        expect.stringContaining("SessionEnd does not run mcp_tool handlers"),
      ]),
    );
    expect(ruleIds(root)).toContain("codex.hook.unknown-handler-type");
    expect(ruleIds(root)).toContain("codex.hook.mcp-tool-without-server-or-tool");
    expect(ruleIds(root)).toContain("codex.hook.invalid-group");
    expect(ruleIds(root)).not.toContain("codex.hook.prompt-without-prompt");
  });

  test("only SessionEnd and Interrupt timeouts outside 1–3 are findings", () => {
    const root = mkPinnedProject("agentscan-codex-timeout-");
    write(
      root,
      ".codex/hooks.json",
      JSON.stringify({
        hooks: {
          Interrupt: [
            { hooks: [{ type: "command", command: "echo low", timeout: 0 }] },
            { hooks: [{ type: "command", command: "echo ok", timeout: 3 }] },
          ],
          SessionEnd: [{ hooks: [{ type: "command", command: "echo high", timeout: 4 }] }],
          PreToolUse: [{ hooks: [{ type: "command", command: "echo wide", timeout: 30 }] }],
          PostToolUse: [{ hooks: [{ type: "command", command: "echo huge", timeout: 9999 }] }],
        },
      }),
    );
    const ids = ruleIds(root);
    expect(ids.filter((id) => id === "codex.hook.timeout-out-of-bounds")).toHaveLength(2);
    const timed = findingsFor(root).facts.hooks.filter((hook) => hook.schemaProfile === "codex");
    expect(timed.find((hook) => hook.event === "PreToolUse")?.timeout).toBe(30);
    expect(timed.find((hook) => hook.event === "PreToolUse")?.timeoutOutOfBounds).toBeUndefined();
    expect(timed.find((hook) => hook.event === "Interrupt" && hook.timeout === 3)?.timeoutOutOfBounds).toBeUndefined();
  });

  test("a missing relative command is codex.hook.missing-script", () => {
    const root = mkPinnedProject("agentscan-codex-script-");
    write(
      root,
      ".codex/hooks.json",
      JSON.stringify({
        hooks: {
          Stop: [{ hooks: [{ type: "command", command: "./missing-codex.sh" }] }],
        },
      }),
    );
    expect(ruleIds(root)).toContain("codex.hook.missing-script");
  });

  test("an empty command is codex.hook.command-without-command", () => {
    const root = mkPinnedProject("agentscan-codex-empty-");
    write(
      root,
      ".codex/hooks.json",
      JSON.stringify({
        hooks: { Stop: [{ hooks: [{ type: "command", command: "" }] }] },
      }),
    );
    expect(ruleIds(root)).toContain("codex.hook.command-without-command");
  });

  test("user hooks stay off unless --global, and CODEX_HOME wins over ~/.codex", () => {
    const root = mkPinnedProject("agentscan-codex-global-");
    const home = mkPinnedRoot("agentscan-codex-home-");
    const codexHome = mkPinnedRoot("agentscan-codex-home-env-");
    write(
      home,
      ".codex/hooks.json",
      JSON.stringify({
        hooks: { Stop: [{ hooks: [{ type: "command", command: "echo home" }] }] },
      }),
    );
    write(
      codexHome,
      "hooks.json",
      JSON.stringify({
        hooks: { SessionStart: [{ hooks: [{ type: "command", command: "echo env" }] }] },
      }),
    );
    write(
      codexHome,
      "config.toml",
      `
[[hooks.UserPromptSubmit]]
[[hooks.UserPromptSubmit.hooks]]
type = "command"
command = "echo toml"
`,
    );
    withHome(home, () => {
      expect(findingsFor(root, false).facts.hooks.some((hook) => hook.schemaProfile === "codex")).toBe(false);
      const on = findingsFor(root, true);
      expect(on.facts.hooks.some((hook) => hook.schemaProfile === "codex" && hook.event === "Stop")).toBe(true);
      withEnv({ CODEX_HOME: codexHome }, () => {
        const events = findingsFor(root, true)
          .facts.hooks.filter((hook) => hook.schemaProfile === "codex")
          .map((hook) => hook.event)
          .sort();
        expect(events).toEqual(["SessionStart", "UserPromptSubmit"]);
      });
    });
  });

  test("invalid config.toml is one config error, shared with the MCP reader", () => {
    const root = mkPinnedProject("agentscan-codex-bad-toml-");
    write(root, ".codex/config.toml", "[[hooks.SessionStart\n");
    const errors = findingsFor(root).facts.configErrors.filter((err) => err.path.endsWith(".codex/config.toml"));
    expect(errors).toHaveLength(1);
    expect(ruleIds(root).filter((id) => id === "config.unreadable")).toHaveLength(1);
  });
});
