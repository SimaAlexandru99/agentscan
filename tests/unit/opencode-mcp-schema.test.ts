import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mkPinnedProject } from "../helpers/tmp";
import { analyze } from "../../src/analyze";
import { defaultConfig } from "../../src/config/schema";
import { extractFacts } from "../../src/facts/extract";

function tmpProject(prefix: string): string {
  return mkPinnedProject(prefix, "opencode-mcp");
}

function write(root: string, rel: string, body: string): void {
  const abs = join(root, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, body, "utf8");
}

function ruleIds(dir: string): string[] {
  return analyze({ dir }).findings.map((finding) => finding.ruleId);
}

describe("OpenCode MCP V1/V2 schema", () => {
  test("V2 local requires type and command", () => {
    const root = tmpProject("agentscan-oc-v2-local-");
    write(
      root,
      "opencode.json",
      JSON.stringify({
        mcp: {
          servers: {
            docs: { type: "local" },
          },
        },
      }),
    );
    expect(ruleIds(root)).toEqual(["opencode.mcp.local-without-command"]);
  });

  test("V2 remote requires url", () => {
    const root = tmpProject("agentscan-oc-v2-remote-");
    write(
      root,
      "opencode.json",
      JSON.stringify({
        mcp: {
          servers: {
            docs: { type: "remote" },
          },
        },
      }),
    );
    expect(ruleIds(root)).toEqual(["opencode.mcp.remote-without-url"]);
  });

  test("V2 rejects a launch field that contradicts type", () => {
    const root = tmpProject("agentscan-oc-v2-mismatch-");
    write(
      root,
      "opencode.json",
      JSON.stringify({
        mcp: {
          servers: {
            docs: { type: "local", command: ["npx"], url: "https://example.com/mcp" },
          },
        },
      }),
    );
    expect(ruleIds(root)).toEqual(["opencode.mcp.invalid-launch-for-type"]);
  });

  test("V1 enabled-only override does not emit a hard error", () => {
    const root = tmpProject("agentscan-oc-v1-inherit-");
    write(
      root,
      "opencode.json",
      JSON.stringify({
        mcp: {
          docs: { enabled: true },
        },
      }),
    );
    const facts = extractFacts(root, defaultConfig, { includeGlobal: false });
    expect(facts.mcp[0]!.opencodeSchema).toBe("v1");
    expect(facts.mcp[0]!.opencodeInherit).toBe(true);
    expect(ruleIds(root)).toEqual([]);
  });

  test("V1 required fields are not applied to a valid V2 local server", () => {
    const root = tmpProject("agentscan-oc-v2-ok-");
    write(
      root,
      "opencode.jsonc",
      `{
        "mcp": {
          "servers": {
            "docs": { "type": "local", "command": ["npx", "-y", "mcp-server"] }
          }
        }
      }\n`,
    );
    expect(ruleIds(root)).toEqual([]);
  });
});
