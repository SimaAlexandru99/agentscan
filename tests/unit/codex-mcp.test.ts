import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import * as os from "node:os";
import { join } from "node:path";
import { tmpProject, write } from "../helpers/tmp";
import { findingsFor } from "../helpers/scan";
import { withEnv, withHome } from "../helpers/env";

describe("Codex user MCP is --global only", () => {
  test("project .codex/config.toml still parses as codex-toml", () => {
    const root = tmpProject("agentscan-codex-mcp-project-");
    write(
      root,
      ".codex/config.toml",
      `[mcp_servers.docs]
command = "npx"
args = ["-y", "mcp-server"]

[mcp_servers.remote]
url = "https://example.com/mcp"
`,
    );
    const { facts, findings } = findingsFor(root, false);
    expect(facts.mcp.map((s) => s.schemaProfile).sort()).toEqual(["codex-toml", "codex-toml"]);
    expect(facts.mcp.every((s) => s.sourceProvider === "codex")).toBe(true);
    expect(findings.map((f) => f.ruleId)).not.toContain("claude.mcp.url-without-type");
    expect(findings.map((f) => f.ruleId)).not.toContain("codex.mcp.no-launch");
  });

  test("without --global, user config.toml is not read", () => {
    const root = tmpProject("agentscan-codex-mcp-noglobal-");
    write(root, "AGENTS.md", "keep scanable\n");
    const tmpHome = mkdtempSync(join(os.tmpdir(), "agentscan-codex-home-"));
    write(
      tmpHome,
      ".codex/config.toml",
      `[mcp_servers.fromhome]
url = "https://example.com/mcp"
`,
    );
    withHome(tmpHome, () => {
      const { facts } = findingsFor(root, false);
      expect(facts.mcp.some((s) => s.name === "fromhome")).toBe(false);
    });
  });

  test("with --global, stdio + url parse as codex-toml without claude url-without-type", () => {
    const root = tmpProject("agentscan-codex-mcp-global-");
    write(root, "AGENTS.md", "keep scanable\n");
    const tmpHome = mkdtempSync(join(os.tmpdir(), "agentscan-codex-home-"));
    write(
      tmpHome,
      ".codex/config.toml",
      `[mcp_servers.docs]
command = "npx"

[mcp_servers.remote]
url = "https://example.com/mcp"
`,
    );
    withHome(tmpHome, () => {
      const { facts, findings } = findingsFor(root, true);
      const user = facts.mcp.filter((s) => s.path.includes(tmpHome));
      expect(user.map((s) => s.schemaProfile).sort()).toEqual(["codex-toml", "codex-toml"]);
      expect(user.every((s) => s.consumedBy?.[0] === "codex")).toBe(true);
      expect(findings.map((f) => f.ruleId)).not.toContain("claude.mcp.url-without-type");
    });
  });

  test("empty user server table is codex.mcp.no-launch", () => {
    const root = tmpProject("agentscan-codex-mcp-empty-");
    write(root, "AGENTS.md", "keep scanable\n");
    const tmpHome = mkdtempSync(join(os.tmpdir(), "agentscan-codex-home-"));
    write(tmpHome, ".codex/config.toml", "[mcp_servers.orphan]\n");
    withHome(tmpHome, () => {
      expect(findingsFor(root, true).findings.map((f) => f.ruleId)).toContain("codex.mcp.no-launch");
    });
  });

  test("same name in project and user both stay", () => {
    const root = tmpProject("agentscan-codex-mcp-both-");
    write(
      root,
      ".codex/config.toml",
      `[mcp_servers.docs]
command = "npx"
`,
    );
    const tmpHome = mkdtempSync(join(os.tmpdir(), "agentscan-codex-home-"));
    write(
      tmpHome,
      ".codex/config.toml",
      `[mcp_servers.docs]
command = "npx"
env = { ANTHROPIC_API_KEY = "sk-ant-abcdefghijklmnop" }
`,
    );
    withHome(tmpHome, () => {
      const { facts, findings } = findingsFor(root, true);
      const pair = facts.mcp.filter((s) => s.name === "docs" && s.schemaProfile === "codex-toml");
      expect(pair).toHaveLength(2);
      expect(pair.every((s) => s.effective === undefined)).toBe(true);
      expect(pair.every((s) => !("codexEffective" in s))).toBe(true);
      expect(findings.map((f) => f.ruleId)).not.toContain("codex.mcp.no-launch");
    });
  });

  test("CODEX_HOME overrides ~/.codex under --global", () => {
    const root = tmpProject("agentscan-codex-home-env-");
    write(root, "AGENTS.md", "keep scanable\n");
    const altHome = mkdtempSync(join(os.tmpdir(), "agentscan-codex-althome-"));
    write(
      altHome,
      "config.toml",
      `[mcp_servers.fromhome]
url = "https://example.com/mcp"
`,
    );
    withEnv({ CODEX_HOME: altHome }, () => {
      const { facts } = findingsFor(root, true);
      expect(facts.mcp.some((s) => s.name === "fromhome" && s.schemaProfile === "codex-toml")).toBe(
        true,
      );
    });
  });
});
