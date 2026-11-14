import { describe, expect, test } from "bun:test";
import { mkPinnedProject, mkPinnedRoot, write } from "../helpers/tmp";
import { findingsFor } from "../helpers/scan";
import { withHome } from "../helpers/env";

describe("Goose extensions in ~/.config/goose/config.yaml (docs/spec/goose-mcp.md)", () => {
  test("stdio and streamable_http normalise to MCP facts; only under --global", () => {
    const home = mkPinnedRoot("agentscan-goose-home-");
    write(
      home,
      ".config/goose/config.yaml",
      [
        "GOOSE_PROVIDER: openai",
        "extensions:",
        "  developer: { type: builtin, enabled: true, name: developer }",
        "  filesystem:",
        "    type: stdio",
        "    enabled: true",
        "    cmd: ./missing-server",
        "    args: [\"/tmp\"]",
        "    envs: { GITHUB_TOKEN: \"literal-value\" }",
        "  remote-tools: { type: streamable_http, enabled: true, uri: \"https://example.com/mcp\", headers: {} }",
        "  old-sse: { type: sse, enabled: true, uri: \"https://example.com/sse\" }",
        "  off: { type: sse, enabled: false }",
        "  nocmd: { type: stdio, enabled: true }",
      ].join("\n"),
    );
    const project = mkPinnedProject("agentscan-goose-project-");
    withHome(home, () => {
      expect(findingsFor(project).facts.mcp.some((s) => s.sourceProvider === "goose")).toBe(false);
      const { facts, findings } = findingsFor(project, true);
      const goose = facts.mcp.filter((s) => s.sourceProvider === "goose");
      expect(goose.map((s) => s.name).sort()).toEqual(["filesystem", "old-sse", "remote-tools"]);
      const ids = findings.map((f) => `${f.ruleId}:${f.subject}`);
      expect(ids.filter((id) => id.startsWith("goose.mcp.no-launch"))).toEqual([expect.stringContaining("mcp:old-sse@")]);
      expect(ids.some((id) => id.startsWith("mcp.command-missing") && id.includes("mcp:filesystem@"))).toBe(true);
      expect(ids.some((id) => id.startsWith("mcp.literal-env") && id.includes("mcp:filesystem@"))).toBe(true);
      expect(facts.configErrors).toEqual([]);
    });
  });
});
