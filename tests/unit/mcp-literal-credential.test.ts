import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import * as os from "node:os";
import { join } from "node:path";
import { analyze } from "../../src/analyze";
import { defaultConfig } from "../../src/config/schema";
import { extractFacts } from "../../src/discover/extract";
import { scanContext, tmpProject, write } from "../helpers/tmp";
import { ruleIds } from "../helpers/scan";
import { withHome } from "../helpers/env";

function findings(root: string) {
  return analyze({ dir: root }).findings;
}

describe("mcp.literal-credential", () => {
  test("Cursor auth.CLIENT_SECRET literal is a warning and never echoes the value", () => {
    const root = tmpProject("agentscan-cred-auth-");
    const secret = "oauth-client-secret-value";
    write(
      root,
      ".cursor/mcp.json",
      JSON.stringify({
        mcpServers: {
          linear: {
            url: "https://mcp.linear.app/mcp",
            auth: { CLIENT_ID: "public-id", CLIENT_SECRET: secret },
          },
        },
      }),
    );
    const facts = extractFacts(scanContext(root), defaultConfig);
    expect(facts.mcp[0]!.literalCredentialFields).toEqual(["auth.CLIENT_SECRET"]);
    const hits = findings(root).filter((f) => f.ruleId === "mcp.literal-credential");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.severity).toBe("warning");
    expect(hits[0]!.message).toContain("auth.CLIENT_SECRET");
    expect(hits[0]!.message).not.toContain(secret);
    expect(JSON.stringify(hits[0]!)).not.toContain(secret);
  });

  test("headers.API_KEY literal fires; interpolated headers do not", () => {
    const root = tmpProject("agentscan-cred-headers-");
    write(
      root,
      ".cursor/mcp.json",
      JSON.stringify({
        mcpServers: {
          literal: {
            url: "https://example.com/mcp",
            headers: { API_KEY: "project-local-api-key" },
          },
          interpolated: {
            url: "https://example.com/other",
            headers: { API_KEY: "${env:API_KEY}" },
          },
        },
      }),
    );
    const facts = extractFacts(scanContext(root), defaultConfig);
    const lit = facts.mcp.find((s) => s.name === "literal");
    const interp = facts.mcp.find((s) => s.name === "interpolated");
    expect(lit?.literalCredentialFields).toEqual(["headers.API_KEY"]);
    expect(interp?.literalCredentialFields ?? []).toEqual([]);
    const ids = findings(root)
      .filter((f) => f.ruleId === "mcp.literal-credential")
      .map((f) => f.message);
    expect(ids.some((m) => m.includes("literal") && m.includes("headers.API_KEY"))).toBe(true);
    expect(ids.some((m) => m.includes("interpolated"))).toBe(false);
  });

  test("Authorization header literals fire; ${input} does not", () => {
    const root = tmpProject("agentscan-cred-authz-");
    write(
      root,
      ".vscode/mcp.json",
      JSON.stringify({
        servers: {
          bad: {
            type: "http",
            url: "https://example.com/mcp",
            headers: { Authorization: "Bearer project-local-secret" },
          },
          ok: {
            type: "http",
            url: "https://example.com/other",
            headers: { Authorization: "Bearer ${input:github-token}" },
          },
        },
      }),
    );
    const facts = extractFacts(scanContext(root), defaultConfig);
    expect(facts.mcp.find((s) => s.name === "bad")?.literalCredentialFields).toEqual([
      "headers.Authorization",
    ]);
    expect(facts.mcp.find((s) => s.name === "ok")?.literalCredentialFields ?? []).toEqual([]);
    expect(findings(root).some((f) => f.ruleId === "mcp.literal-credential")).toBe(true);
  });

  test("http_headers is inspected the same way as headers", () => {
    const root = tmpProject("agentscan-cred-http-headers-");
    write(
      root,
      ".mcp.json",
      JSON.stringify({
        mcpServers: {
          svc: {
            command: "npx",
            args: ["-y", "fake-mcp"],
            http_headers: { API_KEY: "project-local-api-key" },
          },
        },
      }),
    );
    const facts = extractFacts(scanContext(root), defaultConfig);
    expect(facts.mcp[0]!.literalCredentialFields).toEqual(["http_headers.API_KEY"]);
    expect(findings(root).map((f) => f.ruleId)).toContain("mcp.literal-credential");
  });

  test("Grok {{session_id}} and Gemini %VAR% in headers are interpolation", () => {
    const root = tmpProject("agentscan-cred-interp-");
    write(
      root,
      ".grok/config.toml",
      `[mcp_servers.session]
url = "https://example.com/mcp"
headers = { API_KEY = "{{session_id}}" }
`,
    );
    write(
      root,
      ".gemini/settings.json",
      JSON.stringify({
        mcpServers: {
          win: {
            httpUrl: "https://example.com/mcp",
            headers: { API_KEY: "%GEMINI_API_KEY%" },
          },
        },
      }),
    );
    const facts = extractFacts(scanContext(root), defaultConfig);
    expect(facts.mcp.every((s) => (s.literalCredentialFields ?? []).length === 0)).toBe(true);
    expect(findings(root).map((f) => f.ruleId)).not.toContain("mcp.literal-credential");
    expect(findings(root).map((f) => f.ruleId)).not.toContain("mcp.literal-env");
  });

  test("Grok literal header still fires when the value is not interpolated", () => {
    const root = tmpProject("agentscan-cred-grok-lit-");
    write(
      root,
      ".grok/config.toml",
      `[mcp_servers.remote]
url = "https://example.com/mcp"
headers = { API_KEY = "project-local-api-key" }
`,
    );
    const facts = extractFacts(scanContext(root), defaultConfig);
    expect(facts.mcp[0]!.literalCredentialFields).toEqual(["headers.API_KEY"]);
    expect(findings(root).map((f) => f.ruleId)).toContain("mcp.literal-credential");
  });

  test("Content-Type and non-secret header names are ignored", () => {
    const root = tmpProject("agentscan-cred-ignore-");
    write(
      root,
      ".cursor/mcp.json",
      JSON.stringify({
        mcpServers: {
          svc: {
            url: "https://example.com/mcp",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
          },
        },
      }),
    );
    const facts = extractFacts(scanContext(root), defaultConfig);
    expect(facts.mcp[0]!.literalCredentialFields ?? []).toEqual([]);
    expect(findings(root).map((f) => f.ruleId)).not.toContain("mcp.literal-credential");
  });
});

/**
 * Precedence decides which same-name server a provider launches, not which
 * file is read for secrets: a literal in the user file still leaks.
 */
const tomlServer = 'command = "npx"\n';
const userSecrets: { provider: string; project?: [string, string]; home: [string, string]; ruleId: string }[] = [
  {
    provider: "Claude ~/.claude.json",
    project: [".mcp.json", JSON.stringify({ mcpServers: { docs: { command: "npx" } } })],
    home: [
      ".claude.json",
      JSON.stringify({
        mcpServers: { docs: { command: "npx", env: { API_TOKEN: "not-interpolated-literal" } } },
      }),
    ],
    ruleId: "mcp.literal-env",
  },
  {
    provider: "Codex ~/.codex/config.toml",
    project: [".codex/config.toml", `[mcp_servers.docs]\n${tomlServer}`],
    home: [
      ".codex/config.toml",
      `[mcp_servers.docs]\n${tomlServer}env = { ANTHROPIC_API_KEY = "sk-ant-abcdefghijklmnop" }\n`,
    ],
    ruleId: "security.hardcoded-secret",
  },
  {
    provider: "Grok ~/.grok/config.toml",
    project: [".grok/config.toml", `[mcp_servers.docs]\n${tomlServer}`],
    home: [
      ".grok/config.toml",
      `[mcp_servers.docs]\n${tomlServer}env = { ANTHROPIC_API_KEY = "sk-ant-abcdefghijklmnop" }\n`,
    ],
    ruleId: "security.hardcoded-secret",
  },
  {
    provider: "Windsurf ~/.codeium/windsurf/mcp_config.json",
    home: [
      ".codeium/windsurf/mcp_config.json",
      JSON.stringify({
        mcpServers: { leaked: { command: "npx", env: { ANTHROPIC_API_KEY: "sk-ant-abcdefghijklmnop" } } },
      }),
    ],
    ruleId: "security.hardcoded-secret",
  },
];

describe("secrets in user MCP config under --global", () => {
  test.each(userSecrets)("$provider -> $ruleId", ({ project, home, ruleId }) => {
    const root = tmpProject("agentscan-user-secret-");
    write(root, "AGENTS.md", "keep scanable\n");
    if (project) write(root, project[0], project[1]);
    const tmpHome = mkdtempSync(join(os.tmpdir(), "agentscan-user-secret-home-"));
    write(tmpHome, home[0], home[1]);
    withHome(tmpHome, () => {
      expect(ruleIds(root, true)).toContain(ruleId);
    });
  });
});

test("MCP facts carry the secret label, never the secret value", () => {
  const root = tmpProject("agentscan-secret-label-");
  const key = "sk-ant-abcdefghijklmnop";
  write(root, ".mcp.json", JSON.stringify({ mcpServers: { leaked: { command: "npx", env: { K: key } } } }));
  const { facts, findings } = analyze({ dir: root });
  expect(facts.mcp.map((s) => s.secretLabel)).toEqual(["Anthropic key"]);
  expect(JSON.stringify(facts)).not.toContain(key);
  expect(findings.map((f) => f.ruleId)).toContain("security.hardcoded-secret");
});
