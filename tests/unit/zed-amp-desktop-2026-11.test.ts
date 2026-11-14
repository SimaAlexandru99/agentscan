import { describe, expect, test } from "bun:test";
import { mkPinnedProject, write } from "../helpers/tmp";
import { findingsFor } from "../helpers/scan";
import { withHome } from "../helpers/env";

describe("Zed context_servers", () => {
  test("project .zed/settings.json with // comments: documented entries pass, an empty one is zed.mcp.no-launch", () => {
    const root = mkPinnedProject("agentscan-zed-project-");
    write(
      root,
      ".zed/settings.json",
      `{
  // Zed settings are JSON with // comments
  "theme": "One Dark",
  "context_servers": {
    "local-mcp-server": { "command": "some-command", "args": ["arg-1", "arg-2"], "env": {} },
    "remote-mcp-server": { "url": "https://example.com/mcp", "headers": { "Authorization": "Bearer <token>" } },
    "broken": {}
  }
}
`,
    );
    const analysis = findingsFor(root);
    expect(analysis.facts.configErrors).toEqual([]);
    const zed = analysis.facts.mcp.filter((server) => server.schemaProfile === "zed-json");
    expect(zed.map((server) => server.name).sort()).toEqual(["broken", "local-mcp-server", "remote-mcp-server"]);
    expect(analysis.findings.filter((f) => f.ruleId.endsWith(".mcp.no-launch")).map((f) => f.ruleId)).toEqual([
      "zed.mcp.no-launch",
    ]);
    expect(analysis.findings.map((f) => f.ruleId)).not.toContain("claude.mcp.url-without-type");
  });

  test("settings without context_servers are not a config error", () => {
    const root = mkPinnedProject("agentscan-zed-nokey-");
    write(root, ".zed/settings.json", `{ "theme": "One Dark" }`);
    const analysis = findingsFor(root);
    expect(analysis.facts.configErrors).toEqual([]);
    expect(analysis.facts.mcp).toEqual([]);
  });

  test("user ~/.config/zed/settings.json is read only under --global", () => {
    const root = mkPinnedProject("agentscan-zed-root-");
    const home = mkPinnedProject("agentscan-zed-home-");
    write(home, ".config/zed/settings.json", JSON.stringify({ context_servers: { dead: { args: [] } } }));
    withHome(home, () => {
      expect(findingsFor(root, false).facts.mcp).toEqual([]);
      expect(findingsFor(root, true).findings.map((f) => f.ruleId)).toContain("zed.mcp.no-launch");
    });
  });
});
