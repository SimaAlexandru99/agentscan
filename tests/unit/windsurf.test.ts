import { describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import { join } from "node:path";
import { mkPinnedProject, mkPinnedRoot } from "../helpers/tmp";
import { analyze } from "../../src/analyze";
import { runChecks } from "../../src/checks/index";
import { defaultConfig } from "../../src/config/schema";
import { mcpProfileFromPath } from "../../src/facts/provider";
import { extractFacts } from "../../src/facts/extract";

function tmpProject(prefix: string): string {
  return mkPinnedProject(prefix, "windsurf");
}

function write(root: string, rel: string, body: string): void {
  const abs = join(root, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, body, "utf8");
}

function findingsFor(root: string, includeGlobal = false) {
  const facts = extractFacts(root, defaultConfig, { includeGlobal });
  return { facts, findings: runChecks(facts) };
}

function ruleIds(root: string, includeGlobal = false): string[] {
  return findingsFor(root, includeGlobal).findings.map((f) => f.ruleId);
}

function triggered(body: string): string {
  return `---\ntrigger: always_on\n---\n${body}`;
}

describe("Windsurf workspace rules", () => {
  test("inventories .devin/rules and .windsurf/rules together", () => {
    const root = tmpProject("agentscan-windsurf-both-");
    write(root, ".devin/rules/preferred.md", triggered("use bun\n"));
    write(root, ".windsurf/rules/fallback.md", triggered("legacy path\n"));
    const { facts } = findingsFor(root);
    const paths = (facts.rules ?? []).filter((r) => r.sourceProvider === "windsurf").map((r) => r.path);
    expect(paths).toContain(join(root, ".devin/rules/preferred.md"));
    expect(paths).toContain(join(root, ".windsurf/rules/fallback.md"));
  });

  test("finds subdirectory-scoped .devin/rules", () => {
    const root = tmpProject("agentscan-windsurf-nested-");
    write(root, "packages/app/.devin/rules/front.md", triggered("frontend only\n"));
    const { facts } = findingsFor(root);
    expect(
      facts.rules?.some((r) => r.path === join(root, "packages/app/.devin/rules/front.md")),
    ).toBe(true);
  });

  test("reads legacy .windsurfrules without missing-trigger", () => {
    const root = tmpProject("agentscan-windsurf-legacy-");
    write(root, ".windsurfrules", "always on legacy\n");
    const { facts, findings } = findingsFor(root);
    const legacy = facts.rules?.find((r) => r.path === join(root, ".windsurfrules"));
    expect(legacy?.windsurfScope).toBe("legacy");
    expect(findings.map((f) => f.ruleId)).not.toContain("windsurf.rule.missing-trigger");
  });

  test("12,000 characters is clean; 12,001 is windsurf.rule.too-large", () => {
    const root = tmpProject("agentscan-windsurf-chars-");
    const prefix = triggered("");
    write(root, ".devin/rules/ok.md", `${prefix}${"x".repeat(12_000 - prefix.length)}`);
    write(root, ".devin/rules/over.md", `${prefix}${"y".repeat(12_001 - prefix.length)}`);
    const ids = ruleIds(root);
    expect(ids).toContain("windsurf.rule.too-large");
    expect(ids.filter((id) => id === "windsurf.rule.too-large")).toHaveLength(1);
  });

  test("600-line Windsurf rule under 12k chars is not cursor.rule.too-large", () => {
    const root = tmpProject("agentscan-windsurf-lines-");
    write(root, ".devin/rules/long.md", triggered(`${"x\n".repeat(600)}`));
    const { facts, findings } = findingsFor(root);
    const rule = facts.rules?.find((r) => r.path.endsWith("long.md"));
    expect((rule?.lineCount ?? 0) >= 600).toBe(true);
    expect((rule?.charCount ?? 0) < 12_000).toBe(true);
    expect(findings.map((f) => f.ruleId)).not.toContain("cursor.rule.too-large");
    expect(findings.map((f) => f.ruleId)).not.toContain("windsurf.rule.too-large");
  });

  test("workspace rule without trigger is windsurf.rule.missing-trigger", () => {
    const root = tmpProject("agentscan-windsurf-trigger-");
    write(root, ".devin/rules/plain.md", "no frontmatter\n");
    expect(ruleIds(root)).toContain("windsurf.rule.missing-trigger");
  });

  test("invalid workspace YAML is not missing-trigger", () => {
    const root = tmpProject("agentscan-windsurf-yaml-");
    write(root, ".devin/rules/broke.md", "---\ntrigger: [unclosed\n---\nbody\n");
    const { facts, findings } = findingsFor(root);
    const rule = facts.rules?.find((r) => r.path.endsWith("broke.md"));
    expect(rule?.windsurfHasTrigger).not.toBe(true);
    expect(findings.map((f) => f.ruleId)).not.toContain("windsurf.rule.missing-trigger");
  });
});

describe("Windsurf Cascade hooks", () => {
  test("unknown event and missing script fire; neither command nor powershell fires", () => {
    const root = tmpProject("agentscan-windsurf-hooks-");
    write(
      root,
      ".windsurf/hooks.json",
      JSON.stringify({
        hooks: {
          pre_read_code: [{ command: "bin/missing-windsurf-hook.sh" }],
          not_an_event: [{ command: "true" }],
          pre_write_code: [{}],
        },
      }),
    );
    const ids = ruleIds(root);
    expect(ids).toContain("windsurf.hook.missing-script");
    expect(ids).toContain("windsurf.hook.unknown-event");
    expect(ids).toContain("windsurf.hook.command-without-command");
    expect(ids).not.toContain("claude.hook.unknown-event");
  });

  test("user hooks.json is --global only", () => {
    const root = tmpProject("agentscan-windsurf-user-hooks-");
    write(root, "AGENTS.md", "keep scanable\n");
    const tmpHome = mkdtempSync(join(os.tmpdir(), "agentscan-windsurf-home-"));
    write(
      tmpHome,
      ".codeium/windsurf/hooks.json",
      JSON.stringify({ hooks: { nope: [{ command: "true" }] } }),
    );
    const homedirSpy = spyOn(os, "homedir").mockReturnValue(tmpHome);
    try {
      expect(ruleIds(root, false)).not.toContain("windsurf.hook.unknown-event");
      expect(ruleIds(root, true)).toContain("windsurf.hook.unknown-event");
    } finally {
      homedirSpy.mockRestore();
    }
  });
});

describe("Windsurf Cascade skills", () => {
  test("workspace .windsurf/skills uses the Agent Skills contract, not Claude", () => {
    const root = tmpProject("agentscan-windsurf-skills-");
    write(
      root,
      ".windsurf/skills/deploy/SKILL.md",
      "---\nname: deploy\ndescription: Ship with checks.\n---\nBody.\n",
    );
    write(root, ".windsurf/skills/bare/SKILL.md", "Just a body.\n");
    const { facts } = findingsFor(root);
    const deploy = facts.skills.find((s) => s.id === "deploy");
    expect(deploy?.sourceProvider).toBe("windsurf");
    expect(deploy?.schemaProfile).toBe("agent-skills");
    const ids = ruleIds(root);
    expect(ids).toContain("agent-skills.skill.missing-frontmatter");
    expect(ids).not.toContain("claude.skill.missing-frontmatter");
    expect(ids).not.toContain("grok.skill.missing-frontmatter");
  });

  test("user ~/.codeium/windsurf/skills is --global only", () => {
    const root = tmpProject("agentscan-windsurf-user-skills-");
    write(root, "AGENTS.md", "keep scanable\n");
    const tmpHome = mkdtempSync(join(os.tmpdir(), "agentscan-windsurf-home-"));
    write(
      tmpHome,
      ".codeium/windsurf/skills/global-one/SKILL.md",
      "---\nname: global-one\ndescription: User skill.\n---\n",
    );
    const homedirSpy = spyOn(os, "homedir").mockReturnValue(tmpHome);
    try {
      const local = findingsFor(root, false).facts.skills.map((s) => s.id);
      expect(local).not.toContain("global-one");
      const global = findingsFor(root, true).facts.skills;
      const hit = global.find((s) => s.id === "global-one");
      expect(hit?.source).toBe("global");
      expect(hit?.sourceProvider).toBe("windsurf");
    } finally {
      homedirSpy.mockRestore();
    }
  });
});

describe("Windsurf workspace rules continued", () => {
  test("a tree with only .devin is a valid scan root", () => {
    const root = mkPinnedRoot("agentscan-windsurf-signal-");
    write(root, ".devin/rules/style.md", triggered("use bun\n"));
    const analysis = analyze({ dir: root });
    expect(analysis.facts.rules?.some((r) => r.sourceProvider === "windsurf")).toBe(true);
  });
});

describe("Windsurf global rules are --global only", () => {
  test("without --global, global_rules.md is not read", () => {
    const root = tmpProject("agentscan-windsurf-noglobal-");
    write(root, "AGENTS.md", "keep scanable\n");
    const tmpHome = mkdtempSync(join(os.tmpdir(), "agentscan-windsurf-home-"));
    write(tmpHome, ".codeium/windsurf/memories/global_rules.md", "always on\n");
    write(tmpHome, ".codeium/windsurf/memories/auto.md", "do not open\n");
    const homedirSpy = spyOn(os, "homedir").mockReturnValue(tmpHome);
    try {
      const { facts } = findingsFor(root, false);
      expect(facts.rules?.some((r) => r.path.includes("global_rules.md"))).toBe(false);
      expect(facts.rules?.some((r) => r.path.endsWith("auto.md"))).toBe(false);
    } finally {
      homedirSpy.mockRestore();
    }
  });

  test("with --global, only global_rules.md is opened; 6,001 chars is too large", () => {
    const root = tmpProject("agentscan-windsurf-global-");
    write(root, "AGENTS.md", "keep scanable\n");
    const tmpHome = mkdtempSync(join(os.tmpdir(), "agentscan-windsurf-home-"));
    write(tmpHome, ".codeium/windsurf/memories/global_rules.md", `${"g".repeat(6_001)}`);
    write(tmpHome, ".codeium/windsurf/memories/auto.md", "do not open\n");
    const homedirSpy = spyOn(os, "homedir").mockReturnValue(tmpHome);
    try {
      const { facts, findings } = findingsFor(root, true);
      expect(facts.rules?.some((r) => r.path.endsWith("global_rules.md"))).toBe(true);
      expect(facts.rules?.some((r) => r.path.endsWith("auto.md"))).toBe(false);
      expect(findings.map((f) => f.ruleId)).toContain("windsurf.rule.global-too-large");
      expect(findings.map((f) => f.ruleId)).not.toContain("windsurf.rule.missing-trigger");
    } finally {
      homedirSpy.mockRestore();
    }
  });
});

describe("Windsurf user MCP is --global only", () => {
  test("mcpProfileFromPath maps the quoted user file", () => {
    expect(mcpProfileFromPath("/home/me/.codeium/windsurf/mcp_config.json")).toBe("windsurf-json");
    expect(mcpProfileFromPath("/home/me/.agents/mcp_config.json")).toBe("antigravity-json");
  });

  test("without --global, user mcp_config.json is not read", () => {
    const root = tmpProject("agentscan-windsurf-mcp-off-");
    write(root, "AGENTS.md", "keep scanable\n");
    const tmpHome = mkdtempSync(join(os.tmpdir(), "agentscan-windsurf-home-"));
    write(
      tmpHome,
      ".codeium/windsurf/mcp_config.json",
      JSON.stringify({ mcpServers: { docs: { command: "npx" } } }),
    );
    const homedirSpy = spyOn(os, "homedir").mockReturnValue(tmpHome);
    try {
      expect(findingsFor(root, false).facts.mcp.some((s) => s.name === "docs")).toBe(false);
    } finally {
      homedirSpy.mockRestore();
    }
  });

  test("command, serverUrl, and url are launchable; url is not claude url-without-type", () => {
    const root = tmpProject("agentscan-windsurf-mcp-launch-");
    write(root, "AGENTS.md", "keep scanable\n");
    const tmpHome = mkdtempSync(join(os.tmpdir(), "agentscan-windsurf-home-"));
    write(
      tmpHome,
      ".codeium/windsurf/mcp_config.json",
      JSON.stringify({
        mcpServers: {
          stdio: { command: "npx", args: ["-y", "mcp-server"] },
          remote: { serverUrl: "https://example.com/mcp" },
          alias: { url: "https://example.com/mcp" },
        },
      }),
    );
    const homedirSpy = spyOn(os, "homedir").mockReturnValue(tmpHome);
    try {
      const { facts, findings } = findingsFor(root, true);
      const user = facts.mcp.filter((s) => s.path.includes(tmpHome));
      expect(user.map((s) => s.schemaProfile).sort()).toEqual([
        "windsurf-json",
        "windsurf-json",
        "windsurf-json",
      ]);
      expect(user.every((s) => s.sourceProvider === "windsurf")).toBe(true);
      expect(findings.map((f) => f.ruleId)).not.toContain("claude.mcp.url-without-type");
      expect(findings.map((f) => f.ruleId)).not.toContain("windsurf.mcp.no-launch");
    } finally {
      homedirSpy.mockRestore();
    }
  });

  test("empty entry is windsurf.mcp.no-launch", () => {
    const root = tmpProject("agentscan-windsurf-mcp-empty-");
    write(root, "AGENTS.md", "keep scanable\n");
    const tmpHome = mkdtempSync(join(os.tmpdir(), "agentscan-windsurf-home-"));
    write(tmpHome, ".codeium/windsurf/mcp_config.json", JSON.stringify({ mcpServers: { orphan: {} } }));
    const homedirSpy = spyOn(os, "homedir").mockReturnValue(tmpHome);
    try {
      expect(ruleIds(root, true)).toContain("windsurf.mcp.no-launch");
    } finally {
      homedirSpy.mockRestore();
    }
  });

  test("secrets still inspect the user file; ${file:} is not a literal env", () => {
    const root = tmpProject("agentscan-windsurf-mcp-secret-");
    write(root, "AGENTS.md", "keep scanable\n");
    const tmpHome = mkdtempSync(join(os.tmpdir(), "agentscan-windsurf-home-"));
    write(
      tmpHome,
      ".codeium/windsurf/mcp_config.json",
      JSON.stringify({
        mcpServers: {
          leaked: {
            command: "npx",
            env: { ANTHROPIC_API_KEY: "sk-ant-abcdefghijklmnop" },
          },
          filed: {
            command: "npx",
            env: { API_KEY: "${file:~/.secrets/api_key.txt}" },
          },
        },
      }),
    );
    const homedirSpy = spyOn(os, "homedir").mockReturnValue(tmpHome);
    try {
      const ids = ruleIds(root, true);
      expect(ids).toContain("security.hardcoded-secret");
      expect(ids).not.toContain("mcp.literal-env");
    } finally {
      homedirSpy.mockRestore();
    }
  });
});

describe("Windsurf AGENTS.md", () => {
  test("lowercase agents.md is portable, not Windsurf-owned", () => {
    const root = tmpProject("agentscan-windsurf-agentsmd-");
    write(root, "packages/lib/agents.md", "package instructions\n");
    const { facts } = findingsFor(root);
    const found = facts.policyFiles.find((f) => f.path.endsWith("agents.md"));
    expect(found?.kind).toBe("agents-md");
    expect(found?.sourceProvider).toBe("unknown");
  });
});
