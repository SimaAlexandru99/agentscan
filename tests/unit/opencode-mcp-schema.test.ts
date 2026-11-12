import { describe, expect, test } from "bun:test";
import { scanContext, tmpProject, write } from "../helpers/tmp";
import { defaultConfig } from "../../src/config/schema";
import { extractFacts } from "../../src/discover/extract";
import { ruleIds } from "../helpers/scan";

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
    const facts = extractFacts(scanContext(root), defaultConfig);
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

  test("{env:VAR} is a reference, not a hardcoded secret", () => {
    // Checks and discovery once used different interpolation regexes; the
    // checks copy did not know OpenCode's `{env:VAR}`, so a token-shaped
    // variable name inside it was reported as a leaked credential.
    const root = tmpProject("agentscan-oc-env-ref-");
    const tokenShapedName = `ghp_${"A".repeat(24)}`;
    write(
      root,
      "opencode.json",
      JSON.stringify({
        mcp: {
          servers: {
            docs: {
              type: "remote",
              url: "https://example.com/mcp",
              headers: { Authorization: `Bearer {env:${tokenShapedName}}` },
            },
          },
        },
      }),
    );
    expect(ruleIds(root)).not.toContain("security.hardcoded-secret");
  });

  test("every interpolated reference is redacted, not only the first", () => {
    const root = tmpProject("agentscan-oc-env-refs-");
    const tokenShapedName = `ghp_${"B".repeat(24)}`;
    write(
      root,
      "opencode.json",
      JSON.stringify({
        mcp: {
          servers: {
            docs: {
              type: "remote",
              url: "https://example.com/mcp",
              headers: {
                "X-First": "{env:HARMLESS}",
                Authorization: `Bearer {env:${tokenShapedName}}`,
              },
            },
          },
        },
      }),
    );
    expect(ruleIds(root)).not.toContain("security.hardcoded-secret");
  });
});
