import { describe, expect, test } from "bun:test";
import { analyze } from "../../src/analyze";
import { defaultConfig } from "../../src/config/schema";
import { extractFacts } from "../../src/facts/extract";
import { mkPinnedProject } from "../helpers/tmp";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function tmpProject(prefix: string): string {
  return mkPinnedProject(prefix, "literal-credential");
}

function write(root: string, rel: string, body: string): void {
  const abs = join(root, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, body, "utf8");
}

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
    const facts = extractFacts(root, defaultConfig, { includeGlobal: false });
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
    const facts = extractFacts(root, defaultConfig, { includeGlobal: false });
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
    const facts = extractFacts(root, defaultConfig, { includeGlobal: false });
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
    const facts = extractFacts(root, defaultConfig, { includeGlobal: false });
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
    const facts = extractFacts(root, defaultConfig, { includeGlobal: false });
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
    const facts = extractFacts(root, defaultConfig, { includeGlobal: false });
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
    const facts = extractFacts(root, defaultConfig, { includeGlobal: false });
    expect(facts.mcp[0]!.literalCredentialFields ?? []).toEqual([]);
    expect(findings(root).map((f) => f.ruleId)).not.toContain("mcp.literal-credential");
  });
});
