import { describe, expect, test } from "bun:test";
import { mkPinnedProject, mkPinnedRoot, write } from "../helpers/tmp";
import { findingsFor, ruleIds } from "../helpers/scan";
import { withEnv, withHome } from "../helpers/env";

describe("Devin CLI next to legacy Windsurf", () => {
  test("hooks.v1.json PreToolUse is devin, not windsurf.hook.unknown-event", () => {
    const root = mkPinnedProject("agentscan-devin-hooks-");
    write(
      root,
      ".devin/hooks.v1.json",
      JSON.stringify({
        PreToolUse: [
          {
            matcher: "exec",
            hooks: [{ type: "command", command: "echo ok" }],
          },
        ],
      }),
    );
    write(
      root,
      ".windsurf/hooks.json",
      JSON.stringify({ hooks: { pre_read_code: [{ command: "echo legacy" }] } }),
    );
    const ids = ruleIds(root);
    expect(ids).not.toContain("windsurf.hook.unknown-event");
    expect(ids).not.toContain("devin.hook.unknown-event");
    const { facts } = findingsFor(root);
    expect(facts.hooks.some((hook) => hook.schemaProfile === "devin" && hook.event === "PreToolUse")).toBe(
      true,
    );
    expect(facts.hooks.some((hook) => hook.schemaProfile === "windsurf" && hook.event === "pre_read_code")).toBe(
      true,
    );
  });

  test("a snake_case event in hooks.v1.json is devin.hook.unknown-event", () => {
    const root = mkPinnedProject("agentscan-devin-snake-");
    write(
      root,
      ".devin/hooks.v1.json",
      JSON.stringify({
        pre_read_code: [{ matcher: "", hooks: [{ type: "command", command: "echo x" }] }],
      }),
    );
    expect(ruleIds(root)).toContain("devin.hook.unknown-event");
    expect(ruleIds(root)).not.toContain("windsurf.hook.unknown-event");
  });

  test("mcp_config.json url is devin, and config.json without mcpServers is quiet", () => {
    const root = mkPinnedProject("agentscan-devin-mcp-");
    write(
      root,
      ".devin/mcp_config.json",
      JSON.stringify({
        mcpServers: {
          remote: { url: "https://example.com/mcp", transport: "sse" },
          empty: { serverUrl: "https://example.com/mcp" },
        },
      }),
    );
    write(
      root,
      ".devin/config.json",
      JSON.stringify({
        hooks: {
          Stop: [{ hooks: [{ type: "prompt", prompt: "say why" }] }],
        },
      }),
    );
    write(
      root,
      ".agents/mcp_config.json",
      JSON.stringify({ mcpServers: { ag: { url: "https://example.com/ag" } } }),
    );
    const analysis = findingsFor(root);
    const devin = analysis.facts.mcp.filter((server) => server.schemaProfile === "devin-json");
    expect(devin.map((server) => server.name).sort()).toEqual(["empty", "remote"]);
    expect(analysis.facts.mcp.some((server) => server.schemaProfile === "antigravity-json" && server.name === "ag")).toBe(
      true,
    );
    expect(analysis.findings.map((finding) => finding.ruleId)).toContain("devin.mcp.no-launch");
    expect(analysis.findings.map((finding) => finding.ruleId)).not.toContain("antigravity.mcp.no-launch");
    expect(analysis.findings.map((finding) => finding.ruleId)).not.toContain("windsurf.mcp.no-launch");
    expect(analysis.facts.hooks.some((hook) => hook.schemaProfile === "devin" && hook.event === "Stop")).toBe(true);
  });

  test("user Devin files stay off unless --global", () => {
    const root = mkPinnedProject("agentscan-devin-global-");
    const home = mkPinnedRoot("agentscan-devin-home-");
    write(
      home,
      ".config/devin/mcp_config.json",
      JSON.stringify({ mcpServers: { remote: { url: "https://example.com/mcp" } } }),
    );
    write(
      home,
      ".config/devin/config.json",
      JSON.stringify({
        hooks: { SessionStart: [{ hooks: [{ type: "command", command: "echo hi" }] }] },
      }),
    );
    withHome(home, () => {
      expect(findingsFor(root, false).facts.mcp.some((server) => server.path.includes("mcp_config.json"))).toBe(
        false,
      );
      const on = findingsFor(root, true);
      expect(on.facts.mcp.some((server) => server.schemaProfile === "devin-json" && server.name === "remote")).toBe(
        true,
      );
      expect(on.facts.hooks.some((hook) => hook.schemaProfile === "devin" && hook.event === "SessionStart")).toBe(
        true,
      );
      expect(on.findings.map((finding) => finding.ruleId)).not.toContain("claude.mcp.url-without-type");
    });
  });
});

describe("Copilot portable MCP and Local hook classification", () => {
  test("camelCase without version stays vscode.hook.unknown-event", () => {
    const root = mkPinnedProject("agentscan-vscode-camel-");
    write(
      root,
      ".github/hooks/audit.json",
      JSON.stringify({
        hooks: { preToolUse: [{ type: "command", command: "echo x" }] },
      }),
    );
    const ids = ruleIds(root);
    expect(ids).toContain("vscode.hook.unknown-event");
    expect(ids.some((id) => id.startsWith("copilot.hook."))).toBe(false);
  });

  test("version 1 camelCase is copilot, including type http", () => {
    const root = mkPinnedProject("agentscan-copilot-version-");
    write(
      root,
      ".github/hooks/audit.json",
      JSON.stringify({
        version: 1,
        hooks: {
          preToolUse: [{ type: "http", url: "https://example.com/hook" }],
        },
      }),
    );
    const ids = ruleIds(root);
    expect(ids.filter((id) => id.startsWith("vscode.hook."))).toEqual([]);
    expect(ids).not.toContain("copilot.hook.unknown-handler-type");
    expect(ids).not.toContain("copilot.hook.http-without-url");
  });

  test("user mcp-config.json is copilot-json only under --global", () => {
    const root = mkPinnedProject("agentscan-copilot-mcp-");
    const home = mkPinnedRoot("agentscan-copilot-home-");
    write(
      home,
      ".copilot/mcp-config.json",
      JSON.stringify({
        mcpServers: {
          remote: { type: "http", url: "https://example.com/mcp" },
          empty: {},
        },
      }),
    );
    withHome(home, () => {
      expect(findingsFor(root, false).facts.mcp.some((server) => server.path.includes("mcp-config.json"))).toBe(
        false,
      );
      const on = findingsFor(root, true);
      const servers = on.facts.mcp.filter((server) => server.path.includes("mcp-config.json"));
      expect(servers.map((server) => server.schemaProfile)).toEqual(["copilot-json", "copilot-json"]);
      const ids = on.findings.map((finding) => finding.ruleId);
      expect(ids).toContain("vscode.mcp.no-launch");
      expect(ids).not.toContain("claude.mcp.no-launch");
      expect(ids).not.toContain("claude.mcp.url-without-type");
    });
  });

  test("COPILOT_HOME mcp-config.json keeps the copilot-json profile", () => {
    const root = mkPinnedProject("agentscan-copilot-home-env-");
    const home = mkPinnedRoot("agentscan-copilot-env-");
    write(
      home,
      "mcp-config.json",
      JSON.stringify({ mcpServers: { remote: { command: "npx", args: ["-y", "srv"] } } }),
    );
    const emptyHome = mkPinnedRoot("agentscan-copilot-empty-home-");
    withHome(emptyHome, () => {
      withEnv({ COPILOT_HOME: home }, () => {
        const on = findingsFor(root, true);
        const server = on.facts.mcp.find((item) => item.name === "remote");
        expect(server?.schemaProfile).toBe("copilot-json");
        expect(on.findings.map((finding) => finding.ruleId)).not.toContain("vscode.mcp.no-launch");
      });
    });
  });
});
