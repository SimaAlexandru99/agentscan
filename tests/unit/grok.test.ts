import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import * as os from "node:os";
import { join } from "node:path";
import { mkPinnedRoot, tmpProject, write } from "../helpers/tmp";
import { analyze } from "../../src/analyze";
import { findingsFor, ruleIds } from "../helpers/scan";
import { withEnv, withHome } from "../helpers/env";

describe("Grok MCP", () => {
  test("stdio + url parse as grok-toml without claude url-without-type", () => {
    const root = tmpProject("agentscan-grok-mcp-ok-");
    write(
      root,
      ".grok/config.toml",
      `[mcp_servers.docs]
command = "npx"
args = ["-y", "mcp-server"]

[mcp_servers.remote]
url = "https://example.com/mcp"
`,
    );
    const { facts, findings } = findingsFor(root);
    expect(facts.mcp.map((s) => s.schemaProfile).sort()).toEqual(["grok-toml", "grok-toml"]);
    expect(facts.mcp.every((s) => s.sourceProvider === "grok")).toBe(true);
    expect(facts.mcp.every((s) => s.consumedBy?.[0] === "grok")).toBe(true);
    expect(findings.map((f) => f.ruleId)).not.toContain("claude.mcp.url-without-type");
    expect(findings.map((f) => f.ruleId)).not.toContain("grok.mcp.no-launch");
  });

  test("empty server table is grok.mcp.no-launch", () => {
    const root = tmpProject("agentscan-grok-mcp-empty-");
    write(root, ".grok/config.toml", "[mcp_servers.orphan]\n");
    expect(ruleIds(root)).toContain("grok.mcp.no-launch");
  });

  test("closer project config.toml wins the same name", () => {
    const root = tmpProject("agentscan-grok-mcp-walk-");
    write(
      root,
      ".grok/config.toml",
      `[mcp_servers.docs]
command = "npx"
`,
    );
    write(
      root,
      "packages/app/.grok/config.toml",
      `[mcp_servers.docs]
url = "https://example.com/mcp"
`,
    );
    const startDir = join(root, "packages", "app");
    const { facts } = findingsFor(root, false, startDir);
    const pair = facts.mcp.filter((s) => s.name === "docs" && s.schemaProfile === "grok-toml");
    expect(pair).toHaveLength(2);
    const child = pair.find((s) => s.path.includes(`${join("packages", "app", ".grok")}`));
    const parent = pair.find((s) => s !== child);
    expect(child?.effective).toBe(true);
    expect(parent?.effective).toBe(false);
    expect(ruleIds(root, false, startDir)).not.toContain("grok.mcp.no-launch");
  });

  test("project same-name shadows user", () => {
    const root = tmpProject("agentscan-grok-mcp-user-");
    write(
      root,
      ".grok/config.toml",
      `[mcp_servers.docs]
command = "npx"
`,
    );
    const tmpHome = mkdtempSync(join(os.tmpdir(), "agentscan-grok-home-"));
    write(
      tmpHome,
      ".grok/config.toml",
      `[mcp_servers.docs]
command = "npx"
env = { ANTHROPIC_API_KEY = "sk-ant-abcdefghijklmnop" }
`,
    );
    withHome(tmpHome, () => {
      const { facts, findings } = findingsFor(root, true);
      const user = facts.mcp.find((s) => s.path.includes(tmpHome));
      const project = facts.mcp.find((s) => s.path.includes(join(root, ".grok")));
      expect(project?.effective).toBe(true);
      expect(user?.effective).toBe(false);
      expect(findings.map((f) => f.ruleId)).not.toContain("grok.mcp.no-launch");
    });
  });

  test("GROK_HOME overrides ~/.grok under --global", () => {
    const root = tmpProject("agentscan-grok-home-env-");
    write(root, "AGENTS.md", "keep scanable\n");
    const altHome = mkdtempSync(join(os.tmpdir(), "agentscan-grok-althome-"));
    write(
      altHome,
      "config.toml",
      `[mcp_servers.fromhome]
url = "https://example.com/mcp"
`,
    );
    withEnv({ GROK_HOME: altHome }, () => {
      const { facts } = findingsFor(root, true);
      expect(facts.mcp.some((s) => s.name === "fromhome" && s.schemaProfile === "grok-toml")).toBe(
        true,
      );
    });
  });
});

describe("Grok nested skills", () => {
  test("monorepo pkg/.grok/skills is discovered", () => {
    const root = tmpProject("agentscan-grok-nested-skill-");
    write(root, "pkg/.grok/skills/x/SKILL.md", "---\nname: x\ndescription: Nested Grok skill.\n---\n");
    const { facts } = findingsFor(root);
    const skill = facts.skills.find((s) => s.path === join(root, "pkg", ".grok", "skills", "x"));
    expect(skill?.sourceProvider).toBe("grok");
    expect(skill?.schemaProfile).toBe("grok");
  });
});

describe("Grok hooks", () => {
  test("unknown event and mcp_tool type stay on grok ids", () => {
    const root = tmpProject("agentscan-grok-hook-events-");
    write(
      root,
      ".grok/hooks/bad.json",
      JSON.stringify({
        hooks: {
          NotAnEvent: [{ hooks: [{ type: "command", command: "npx" }] }],
          PreToolUse: [{ hooks: [{ type: "mcp_tool", server: "x", tool: "y" }] }],
        },
      }),
    );
    const ids = ruleIds(root);
    expect(ids).toContain("grok.hook.unknown-event");
    expect(ids).toContain("grok.hook.unknown-handler-type");
    expect(ids).not.toContain("claude.hook.unknown-event");
    expect(ids).not.toContain("claude.hook.unknown-handler-type");
  });

  test("http without url", () => {
    const root = tmpProject("agentscan-grok-hook-http-");
    write(
      root,
      ".grok/hooks/http.json",
      JSON.stringify({
        hooks: {
          Notification: [{ hooks: [{ type: "http" }] }],
        },
      }),
    );
    expect(ruleIds(root)).toContain("grok.hook.http-without-url");
  });

  test("version:1 github hooks stay Copilot, not Grok", () => {
    const root = tmpProject("agentscan-grok-copilot-regression-");
    write(
      root,
      ".github/hooks/session.json",
      JSON.stringify({
        version: 1,
        hooks: {
          sessionStart: [{ type: "command", command: "npx" }],
        },
      }),
    );
    const { facts, findings } = findingsFor(root);
    expect(facts.hooks.some((h) => h.schemaProfile === "copilot-cli")).toBe(true);
    expect(facts.hooks.some((h) => h.sourceProvider === "grok")).toBe(false);
    expect(findings.map((f) => f.ruleId).some((id) => id.startsWith("grok.hook."))).toBe(false);
  });
});

describe("Grok skills and rules", () => {
  test("optional name/description do not fire Agent Skills or Claude ids", () => {
    const root = tmpProject("agentscan-grok-skill-optional-");
    write(root, ".grok/skills/bare/SKILL.md", "---\nlicense: MIT\n---\nFirst paragraph.\n");
    const { facts } = findingsFor(root);
    expect(facts.skills[0]!.sourceProvider).toBe("grok");
    expect(facts.skills[0]!.schemaProfile).toBe("grok");
    const ids = ruleIds(root);
    expect(ids).not.toContain("agent-skills.skill.name-does-not-match-directory");
    expect(ids).not.toContain("agent-skills.skill.missing-name");
    expect(ids).not.toContain("claude.skill.missing-description");
  });

  test("missing frontmatter is grok.skill.missing-frontmatter", () => {
    const root = tmpProject("agentscan-grok-skill-fm-");
    write(root, ".grok/skills/bare/SKILL.md", "Just a body.\n");
    expect(ruleIds(root)).toContain("grok.skill.missing-frontmatter");
    expect(ruleIds(root)).not.toContain("claude.skill.missing-frontmatter");
  });

  test("unclosed frontmatter is unparseable, not missing frontmatter", () => {
    const root = tmpProject("agentscan-grok-skill-unclosed-");
    write(root, ".grok/skills/open/SKILL.md", "---\nname: open\n");
    const { facts, findings } = findingsFor(root);
    expect(facts.skills[0]?.unparseableFrontmatter).toBe(true);
    expect(findings.map((f) => f.ruleId)).not.toContain("grok.skill.missing-frontmatter");
    expect(findings.map((f) => f.ruleId)).toContain("config.unreadable");
  });

  test("long grok rules are not cursor.rule.too-large", () => {
    const root = tmpProject("agentscan-grok-rules-");
    write(root, ".grok/rules/long.md", `${"line\n".repeat(600)}`);
    const { facts } = findingsFor(root);
    expect(facts.rules?.some((r) => r.sourceProvider === "grok" && r.lineCount >= 600)).toBe(true);
    expect(ruleIds(root)).not.toContain("cursor.rule.too-large");
  });
});

describe("Grok project signal", () => {
  test("a tree with only .grok is a valid scan root", () => {
    const root = mkPinnedRoot("agentscan-grok-signal-");
    write(
      root,
      ".grok/config.toml",
      `[mcp_servers.docs]
command = "npx"
`,
    );
    const analysis = analyze({ dir: root });
    expect(analysis.facts.mcp[0]?.schemaProfile).toBe("grok-toml");
  });
});
