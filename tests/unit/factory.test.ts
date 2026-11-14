import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { mkPinnedProject, mkPinnedRoot, write } from "../helpers/tmp";
import { findingsFor } from "../helpers/scan";
import { withHome } from "../helpers/env";

const ids = (root: string, global = false) =>
  findingsFor(root, global).findings.map((f) => `${f.ruleId}:${f.subject}`);

describe("Factory Droid (docs/spec/factory-*.md)", () => {
  test("unwrapped .factory/hooks.json; settings.json hooks only when it is absent", () => {
    const root = mkPinnedProject("agentscan-factory-hooks-");
    write(
      root,
      ".factory/hooks.json",
      JSON.stringify({
        PreToolUse: [{ matcher: "Execute", commandRegex: "rm", hooks: [{ type: "command", command: "./gone.sh", timeout: 5 }] }],
        BeforeTool: [{ hooks: [{ type: "command", command: "echo x" }] }],
        Stop: [{ hooks: [{ type: "prompt", prompt: "x" }, { type: "command" }] }, { matcher: "*" }],
      }),
    );
    write(root, ".factory/settings.json", JSON.stringify({ hooks: { NotFromSettings: [] } }));
    const found = ids(root);
    expect(found).toContain("factory.hook.missing-script:hook:PreToolUse:./gone.sh");
    expect(found).toContain("factory.hook.unknown-event:hook:BeforeTool");
    expect(found).toContain("factory.hook.unknown-handler-type:hook:Stop:prompt");
    expect(found).toContain("factory.hook.command-without-command:hook:Stop");
    expect(found).toContain("factory.hook.invalid-group:hook:Stop");
    expect(found.some((id) => id.includes("NotFromSettings"))).toBe(false);
    expect(found.some((id) => id.startsWith("claude.hook."))).toBe(false);

    const settingsOnly = mkPinnedProject("agentscan-factory-settings-");
    write(settingsOnly, ".factory/settings.json", JSON.stringify({ hooks: { NopeEvent: [{ hooks: [{ type: "command", command: "echo" }] }] } }));
    // The settings.json fallback is documented for the user file only, so a project one is not read.
    expect(ids(settingsOnly).some((id) => id.includes("NopeEvent"))).toBe(false);

    // Droid reads no `hooks` wrapper in hooks.json, so a wrapped file is a shape error.
    const wrapped = mkPinnedProject("agentscan-factory-wrapped-");
    write(wrapped, ".factory/hooks.json", JSON.stringify({ hooks: { PreToolUse: [] } }));
    const wrappedScan = findingsFor(wrapped);
    expect(wrappedScan.facts.configErrors.map((e) => e.detail)).toContain("invalid hook groups for hooks");
    expect(wrappedScan.findings.map((f) => f.ruleId)).toContain("config.unreadable");

    const legacy = mkPinnedProject("agentscan-factory-legacy-");
    write(legacy, ".factory/hooks/hooks.json", JSON.stringify({ LegacyNope: [{ hooks: [{ type: "command", command: "echo" }] }] }));
    expect(ids(legacy)).toContain("factory.hook.unknown-event:hook:LegacyNope");
  });

  test(".factory/mcp.json on the ancestor walk; ~/.factory/mcp.json only under --global", () => {
    const root = mkPinnedProject("agentscan-factory-mcp-");
    write(
      root,
      ".factory/mcp.json",
      JSON.stringify({
        mcpServers: {
          local: { command: "./missing-server" },
          remote: { type: "http", url: "https://example.com/mcp", headers: { Authorization: "Bearer ${TOKEN}" } },
          dead: { type: "sse" },
        },
      }),
    );
    write(root, "pkg/package.json", "{}");
    const found = findingsFor(root, false, join(root, "pkg")).findings.map((f) => `${f.ruleId}:${f.subject}`);
    expect(found.filter((id) => id.startsWith("factory.mcp.no-launch"))).toEqual([expect.stringContaining("mcp:dead@")]);
    expect(found.some((id) => id.startsWith("mcp.command-missing") && id.includes("mcp:local@"))).toBe(true);
    expect(found.some((id) => id.startsWith("mcp.literal-credential"))).toBe(false);

    const home = mkPinnedRoot("agentscan-factory-home-");
    write(home, ".factory/mcp.json", JSON.stringify({ mcpServers: { userdead: {} } }));
    const project = mkPinnedProject("agentscan-factory-user-");
    withHome(home, () => {
      expect(ids(project).some((id) => id.includes("userdead"))).toBe(false);
      expect(ids(project, true).some((id) => id.startsWith("factory.mcp.no-launch") && id.includes("userdead"))).toBe(true);
    });
  });

  test("droids: top-level .md only; name rule and non-empty body", () => {
    const root = mkPinnedProject("agentscan-factory-droids-");
    write(root, ".factory/droids/ok.md", "---\nname: code_reviewer-2\n---\n\nReview code.\n");
    write(root, ".factory/droids/upper.md", "---\nname: CodeReviewer\n---\n\nReview.\n");
    write(root, ".factory/droids/noname.md", "---\ndescription: x\n---\n\nReview.\n");
    write(root, ".factory/droids/empty.md", "---\nname: empty\n---\n\n  \n");
    write(root, ".factory/droids/nested/deep.md", "---\nname: BAD\n---\n");
    const found = ids(root);
    const droid = (rule: string) => found.filter((id) => id.startsWith(`factory.droid.${rule}`)).map((id) => id.split("/").pop());
    expect(droid("invalid-name").sort()).toEqual(["noname.md", "upper.md"]);
    expect(droid("empty-body")).toEqual(["empty.md"]);
    expect(found.some((id) => id.startsWith("claude.agent."))).toBe(false);
  });

  test(".factory/skills are Agent Skills without the directory-name match", () => {
    const root = mkPinnedProject("agentscan-factory-skills-");
    write(root, ".factory/skills/review/SKILL.md", "---\nname: code-review\ndescription: Reviews.\n---\n\nBody.\n");
    write(root, ".factory/skills/bad/SKILL.md", "---\nname: Bad_Name\ndescription: Reviews.\n---\n\nBody.\n");
    const { facts, findings } = findingsFor(root);
    expect(facts.skills.filter((s) => s.sourceProvider === "factory")).toHaveLength(2);
    const rules = findings.map((f) => f.ruleId);
    expect(rules).not.toContain("agent-skills.skill.name-does-not-match-directory");
    expect(rules).toContain("agent-skills.skill.invalid-name");
  });
});
