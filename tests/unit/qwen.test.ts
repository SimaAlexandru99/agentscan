import { describe, expect, test } from "bun:test";
import { mkPinnedProject, write } from "../helpers/tmp";
import { findingsFor, ruleIds } from "../helpers/scan";

const skillMd = (name: string) => `---\nname: ${name}\ndescription: Does a thing.\n---\n\nBody.\n`;

describe("Qwen Code (docs/spec/qwen-*.md)", () => {
  test("settings.json hooks use Qwen's event set and handler types", () => {
    const root = mkPinnedProject("agentscan-qwen-hooks-");
    write(
      root,
      ".qwen/settings.json",
      JSON.stringify({
        general: { vimMode: true },
        hooks: {
          PreToolUse: [{ matcher: "write_file", hooks: [{ type: "command", command: "echo ok", timeout: 10 }] }],
          TodoCreated: [{ hooks: [{ type: "http", url: "https://example.com/hook" }] }],
          Stop: [{ hooks: [{ type: "prompt", prompt: "check $ARGUMENTS" }, { type: "http" }, { type: "agent" }] }],
          BeforeTool: [{ hooks: [{ type: "command", command: "echo gemini-name" }] }],
          SessionStart: [{ hooks: [{ type: "command", command: "\"$QWEN_PROJECT_DIR/.qwen/hooks/missing.sh\"" }] }],
          Notification: [{ hooks: [{ type: "command", command: "./gone.sh" }] }],
        },
      }),
    );
    const { facts, findings } = findingsFor(root);
    expect(facts.hooks.filter((h) => h.schemaProfile === "qwen").length).toBeGreaterThan(0);
    const ids = findings.map((f) => `${f.ruleId}:${f.subject}`);
    expect(ids).toContain("qwen.hook.unknown-event:hook:BeforeTool");
    expect(ids).toContain("qwen.hook.http-without-url:hook:Stop");
    expect(ids).toContain("qwen.hook.unknown-handler-type:hook:Stop:agent");
    expect(ids).toContain("qwen.hook.missing-script:hook:Notification:./gone.sh");
    expect(ids.filter((id) => id.startsWith("qwen.hook.unknown-event"))).toEqual(["qwen.hook.unknown-event:hook:BeforeTool"]);
    // Unresolved `$QWEN_PROJECT_DIR` is skipped, not reported missing.
    expect(ids.some((id) => id.includes("missing.sh"))).toBe(false);
    expect(findings.some((f) => f.ruleId.startsWith("gemini.") || f.ruleId === "claude.hook.unknown-event")).toBe(false);
  });

  test("mcpServers use the Gemini launch trio; settings without mcpServers are quiet", () => {
    const root = mkPinnedProject("agentscan-qwen-mcp-");
    write(
      root,
      ".qwen/settings.json",
      JSON.stringify({
        mcpServers: {
          py_tools: { command: "python", env: { API_KEY: "${EXTERNAL_API_KEY}" } },
          remote: { httpUrl: "https://example.com/mcp" },
          win_style: { url: "https://example.com/sse", env: { API_KEY: "%EXTERNAL_API_KEY%" } },
          dead: { args: ["x"] },
        },
      }),
    );
    const { facts, findings } = findingsFor(root);
    expect(facts.mcp.map((s) => s.sourceProvider)).toEqual(["qwen", "qwen", "qwen", "qwen"]);
    const ids = findings.map((f) => `${f.ruleId}:${f.subject}`);
    expect(ids.filter((id) => id.startsWith("qwen.mcp.no-launch"))).toHaveLength(1);
    expect(ids.some((id) => id.startsWith("qwen.mcp.no-launch") && id.includes("mcp:dead@"))).toBe(true);
    // `%VAR%` is not Qwen interpolation; `${VAR}` is.
    expect(ids.filter((id) => id.startsWith("mcp.literal-env"))).toEqual([
      expect.stringContaining("mcp:win_style@"),
    ]);
    // No Gemini underscore warning without a Qwen source.
    expect(ids.some((id) => id.startsWith("gemini.mcp.underscore-alias"))).toBe(false);

    const quiet = mkPinnedProject("agentscan-qwen-quiet-");
    write(quiet, ".qwen/settings.json", JSON.stringify({ general: { vimMode: true } }));
    expect(findingsFor(quiet).facts.configErrors).toEqual([]);
  });

  test("%VAR% still counts as interpolation for Gemini", () => {
    const root = mkPinnedProject("agentscan-qwen-gemini-pct-");
    write(
      root,
      ".gemini/settings.json",
      JSON.stringify({ mcpServers: { s: { command: "python", env: { API_KEY: "%EXTERNAL_API_KEY%" } } } }),
    );
    expect(ruleIds(root)).not.toContain("mcp.literal-env");
  });

  test(".qwen/skills uses Qwen's wider name rule and no directory match", () => {
    const root = mkPinnedProject("agentscan-qwen-skills-");
    write(root, ".qwen/skills/review/SKILL.md", skillMd("Code_Review:v1.2"));
    write(root, ".cursor/skills/review/SKILL.md", skillMd("Code_Review:v1.2"));
    const { facts, findings } = findingsFor(root);
    expect(facts.skills.some((s) => s.sourceProvider === "qwen")).toBe(true);
    const qwenIds = findings.filter((f) => f.subject.includes(".qwen")).map((f) => f.ruleId);
    expect(qwenIds).not.toContain("agent-skills.skill.invalid-name");
    expect(qwenIds).not.toContain("agent-skills.skill.name-does-not-match-directory");
    const cursorIds = findings.filter((f) => f.subject.includes(".cursor")).map((f) => f.ruleId);
    expect(cursorIds).toContain("agent-skills.skill.invalid-name");
  });
});
