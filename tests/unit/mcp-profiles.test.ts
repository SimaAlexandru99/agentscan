import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mkPinnedRoot } from "../helpers/tmp";
import { findings, findingsFor } from "../helpers/scan";

describe("MCP profile parsers", () => {
  test("VS Code servers wrapper is scanned, including JSONC comments", () => {
    const root = mkPinnedRoot("agentscan-vscode-mcp-");
    mkdirSync(join(root, ".vscode"), { recursive: true });
    writeFileSync(
      join(root, ".vscode", "mcp.json"),
      `{
        // workspace servers
        "servers": {
          "playwright": {
            "command": "npx",
            "args": ["-y", "@microsoft/mcp-server-playwright"]
          }
        }
      }\n`,
      "utf8",
    );
    const analysis = findingsFor(root);
    const mcp = analysis.facts.mcp;
    expect(mcp.map((s) => s.name)).toEqual(["playwright"]);
    expect(mcp[0]!.schemaProfile).toBe("vscode-json");
    expect(mcp[0]!.hasCommand).toBe(true);
    expect(analysis.findings.filter((f) => f.ruleId.endsWith("mcp.no-launch"))).toEqual([]);
  });

  test("Antigravity serverUrl and url are launchable; httpUrl alone is not", () => {
    const root = mkPinnedRoot("agentscan-ag-mcp-");
    mkdirSync(join(root, ".agents"), { recursive: true });
    writeFileSync(
      join(root, ".agents", "mcp_config.json"),
      JSON.stringify({
        mcpServers: {
          remote: { serverUrl: "https://example.com/mcp/" },
          alias: { url: "https://example.com/mcp/" },
          stale: { httpUrl: "https://example.com/mcp/" },
        },
      }),
      "utf8",
    );
    const found = findings(root);
    expect(found.map((f) => f.ruleId)).toEqual(["antigravity.mcp.no-launch"]);
    expect(found[0]!.message).toContain("stale");
    expect(found[0]!.message).toContain("url");
  });

  test("Cursor url without type is not a Claude false positive", () => {
    const root = mkPinnedRoot("agentscan-cursor-mcp-");
    mkdirSync(join(root, ".cursor"), { recursive: true });
    writeFileSync(
      join(root, ".cursor", "mcp.json"),
      JSON.stringify({
        mcpServers: {
          remote: { url: "http://localhost:3000/mcp" },
        },
      }),
      "utf8",
    );
    expect(findings(root).map((f) => f.ruleId)).toEqual([]);
  });

  test("Codex TOML url without type is not a Claude false positive", () => {
    const root = mkPinnedRoot("agentscan-codex-mcp-");
    mkdirSync(join(root, ".codex"), { recursive: true });
    writeFileSync(
      join(root, ".codex", "config.toml"),
      `[mcp_servers.docs]\nurl = "https://example.com/mcp"\n`,
      "utf8",
    );
    expect(findings(root).map((f) => f.ruleId)).toEqual([]);
  });

  test("${input} and ${env} interpolations are not literal secrets", () => {
    const root = mkPinnedRoot("agentscan-mcp-interp-");
    mkdirSync(join(root, ".vscode"), { recursive: true });
    writeFileSync(
      join(root, ".vscode", "mcp.json"),
      JSON.stringify({
        servers: {
          github: {
            type: "http",
            url: "https://example.com/mcp",
            headers: { Authorization: "Bearer ${input:github-token}" },
          },
        },
      }),
      "utf8",
    );
    const analysis = findingsFor(root);
    expect(analysis.facts.mcp[0]!.literalEnvKeys).toEqual([]);
    expect(analysis.findings.map((f) => f.ruleId)).toEqual([]);
  });
});
