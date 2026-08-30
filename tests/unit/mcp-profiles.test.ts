import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runChecks } from "../../src/checks/index";
import { defaultConfig } from "../../src/config/schema";
import { discoverMcp } from "../../src/discover/mcp";
import { extractFacts } from "../../src/facts/extract";

function findingsFor(root: string) {
  const facts = extractFacts(root, defaultConfig, { includeGlobal: false });
  return runChecks(facts);
}

describe("MCP profile parsers", () => {
  test("VS Code servers wrapper is scanned, including JSONC comments", () => {
    const root = mkdtempSync(join(tmpdir(), "agentscan-vscode-mcp-"));
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
    const mcp = discoverMcp(root, defaultConfig.mcpPaths, []);
    expect(mcp.map((s) => s.name)).toEqual(["playwright"]);
    expect(mcp[0]!.schemaProfile).toBe("vscode-json");
    expect(mcp[0]!.hasCommand).toBe(true);
    expect(
      findingsFor(root).filter((f) => f.ruleId.endsWith("mcp.no-launch")),
    ).toEqual([]);
  });

  test("Antigravity serverUrl is launchable; url alone is not", () => {
    const root = mkdtempSync(join(tmpdir(), "agentscan-ag-mcp-"));
    mkdirSync(join(root, ".agents"), { recursive: true });
    writeFileSync(
      join(root, ".agents", "mcp_config.json"),
      JSON.stringify({
        mcpServers: {
          remote: { serverUrl: "https://example.com/mcp/" },
          stale: { url: "https://example.com/mcp/" },
        },
      }),
      "utf8",
    );
    const findings = findingsFor(root);
    expect(findings.map((f) => f.ruleId)).toEqual(["antigravity.mcp.no-launch"]);
    expect(findings[0]!.message).toContain("serverUrl");
  });

  test("Cursor url without type is not a Claude false positive", () => {
    const root = mkdtempSync(join(tmpdir(), "agentscan-cursor-mcp-"));
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
    expect(findingsFor(root).map((f) => f.ruleId)).toEqual([]);
  });

  test("Codex TOML url without type is not a Claude false positive", () => {
    const root = mkdtempSync(join(tmpdir(), "agentscan-codex-mcp-"));
    mkdirSync(join(root, ".codex"), { recursive: true });
    writeFileSync(
      join(root, ".codex", "config.toml"),
      `[mcp_servers.docs]\nurl = "https://example.com/mcp"\n`,
      "utf8",
    );
    expect(findingsFor(root).map((f) => f.ruleId)).toEqual([]);
  });

  test("${input} and ${env} interpolations are not literal secrets", () => {
    const root = mkdtempSync(join(tmpdir(), "agentscan-mcp-interp-"));
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
    const mcp = discoverMcp(root, defaultConfig.mcpPaths, []);
    expect(mcp[0]!.literalEnvKeys).toEqual([]);
    expect(findingsFor(root).map((f) => f.ruleId)).toEqual([]);
  });
});
