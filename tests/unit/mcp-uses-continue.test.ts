import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mkPinnedProject } from "../helpers/tmp";
import { analyze } from "../../src/analyze";
import { defaultConfig } from "../../src/config/schema";
import { extractFacts } from "../../src/facts/extract";

function tmpProject(prefix: string): string {
  return mkPinnedProject(prefix, "mcp-uses");
}

function write(root: string, rel: string, body: string): void {
  const abs = join(root, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, body, "utf8");
}

function ruleIds(dir: string): string[] {
  return analyze({ dir }).findings.map((finding) => finding.ruleId);
}

describe("MCP uses: is Continue-only", () => {
  test("Claude uses-only -> claude.mcp.no-launch", () => {
    const root = tmpProject("agentscan-uses-claude-");
    write(
      root,
      ".mcp.json",
      JSON.stringify({ mcpServers: { docs: { uses: "continuedev/continue-docs-mcp" } } }),
    );
    const facts = extractFacts(root, defaultConfig, { includeGlobal: false });
    expect(facts.mcp[0]!.launchKind).toBe("no-launch");
    expect(ruleIds(root)).toContain("claude.mcp.no-launch");
    expect(
      analyze({ dir: root }).findings.find((finding) => finding.ruleId === "claude.mcp.no-launch")!
        .message,
    ).not.toContain("uses");
  });

  test("VS Code uses-only -> vscode.mcp.no-launch", () => {
    const root = tmpProject("agentscan-uses-vscode-");
    write(
      root,
      ".vscode/mcp.json",
      JSON.stringify({ servers: { docs: { uses: "continuedev/continue-docs-mcp" } } }),
    );
    expect(ruleIds(root)).toContain("vscode.mcp.no-launch");
  });

  test("Cursor uses-only -> cursor.mcp.no-launch", () => {
    const root = tmpProject("agentscan-uses-cursor-");
    write(
      root,
      ".cursor/mcp.json",
      JSON.stringify({ mcpServers: { docs: { uses: "continuedev/continue-docs-mcp" } } }),
    );
    expect(ruleIds(root)).toContain("cursor.mcp.no-launch");
  });

  test("Codex uses-only -> codex.mcp.no-launch", () => {
    const root = tmpProject("agentscan-uses-codex-");
    write(root, ".codex/config.toml", `[mcp_servers.docs]\nuses = "continuedev/continue-docs-mcp"\n`);
    expect(ruleIds(root)).toContain("codex.mcp.no-launch");
  });

  test("Continue uses-only -> no continue.mcp.no-launch", () => {
    const root = tmpProject("agentscan-uses-continue-");
    write(
      root,
      ".continue/mcpServers/docs.yaml",
      "name: Continue Docs\nuses: continuedev/continue-docs-mcp\n",
    );
    const facts = extractFacts(root, defaultConfig, { includeGlobal: false });
    expect(facts.mcp[0]!.launchKind).toBe("registry-reference");
    expect(ruleIds(root)).not.toContain("continue.mcp.no-launch");
  });
});
