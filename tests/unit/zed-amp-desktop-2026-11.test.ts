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

  test("an extension-provided server (settings only, trailing comma) is launchable", () => {
    const root = mkPinnedProject("agentscan-zed-ext-");
    write(
      root,
      ".zed/settings.json",
      `{
  "context_servers": {
    "mcp-server-context7": { "enabled": true, "remote": false, "settings": {}, },
  },
}
`,
    );
    const analysis = findingsFor(root);
    expect(analysis.facts.configErrors).toEqual([]);
    expect(analysis.findings.map((f) => f.ruleId)).not.toContain("zed.mcp.no-launch");
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

describe("Amp amp.mcpServers", () => {
  const officialExample = {
    "amp.mcpServers": {
      playwright: { command: "npx", args: ["-y", "@playwright/mcp@latest", "--headless"] },
      linear: { url: "https://mcp.linear.app/sse" },
      sourcegraph: {
        url: "${SRC_ENDPOINT}/.api/mcp/v1",
        headers: { Authorization: "token ${SRC_ACCESS_TOKEN}" },
      },
    },
  };

  test("the documented example raises nothing; an empty entry is amp.mcp.no-launch", () => {
    const root = mkPinnedProject("agentscan-amp-project-");
    write(
      root,
      ".amp/settings.json",
      JSON.stringify({
        "amp.mcpServers": { ...officialExample["amp.mcpServers"], broken: {} },
        "amp.skills.path": "x",
      }),
    );
    const analysis = findingsFor(root);
    expect(analysis.facts.configErrors).toEqual([]);
    const amp = analysis.facts.mcp.filter((server) => server.schemaProfile === "amp-json");
    expect(amp.map((server) => server.name).sort()).toEqual(["broken", "linear", "playwright", "sourcegraph"]);
    expect(analysis.findings.map((f) => f.ruleId)).toEqual(["amp.mcp.no-launch"]);
  });

  test("only the nearest .amp/settings.jsonc is read, with comments", () => {
    const root = mkPinnedProject("agentscan-amp-nearest-");
    write(root, ".amp/settings.json", JSON.stringify({ "amp.mcpServers": { far: {} } }));
    write(root, "pkg/.amp/settings.jsonc", `{\n  // nearest\n  "amp.mcpServers": { "near": { "command": "npx" } }\n}\n`);
    const analysis = findingsFor(root, false, `${root}/pkg`);
    expect(analysis.facts.configErrors).toEqual([]);
    expect(analysis.facts.mcp.filter((s) => s.schemaProfile === "amp-json").map((s) => s.name)).toEqual(["near"]);
  });

  test("user settings and skills dirs are read only under --global", () => {
    const root = mkPinnedProject("agentscan-amp-root-");
    const home = mkPinnedProject("agentscan-amp-home-");
    write(home, ".config/amp/settings.json", JSON.stringify({ "amp.mcpServers": { dead: {} } }));
    const skill = (name: string) => `---\nname: ${name}\ndescription: Does ${name} things\n---\n\nBody\n`;
    write(home, ".config/amp/skills/amp-one/SKILL.md", skill("amp-one"));
    write(home, ".config/agents/skills/shared-two/SKILL.md", skill("shared-two"));
    withHome(home, () => {
      const off = findingsFor(root, false);
      expect(off.facts.mcp).toEqual([]);
      expect(off.facts.skills).toEqual([]);
      const on = findingsFor(root, true);
      expect(on.findings.map((f) => f.ruleId)).toContain("amp.mcp.no-launch");
      const names = on.facts.skills.map((s) => s.frontmatterName);
      expect(names).toContain("amp-one");
      expect(names).toContain("shared-two");
    });
  });
});

describe("Claude Desktop (Linux path)", () => {
  const manifest = (overrides: Record<string, unknown>) =>
    JSON.stringify({
      manifest_version: "0.4",
      name: "ext",
      version: "1.0.0",
      description: "d",
      author: { name: "Extension Author" },
      server: { type: "uv", entry_point: "server/main.py" },
      ...overrides,
    });

  test("mcpServers is read only under --global; unknown top-level keys and type/url entries raise nothing", () => {
    const root = mkPinnedProject("agentscan-desktop-root-");
    const home = mkPinnedProject("agentscan-desktop-home-");
    write(
      home,
      ".config/Claude/claude_desktop_config.json",
      JSON.stringify({
        preferences: { sidebarMode: "chat" },
        coworkUserFilesPath: "/x",
        mcpServers: {
          filesystem: { command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"] },
          remote: { type: "http", url: "https://example.com/mcp" },
          bare: { url: "https://example.com/mcp" },
          broken: { args: [] },
        },
      }),
    );
    withHome(home, () => {
      expect(findingsFor(root, false).facts.mcp).toEqual([]);
      const on = findingsFor(root, true);
      expect(on.facts.configErrors).toEqual([]);
      expect(on.facts.mcp.filter((s) => s.schemaProfile === "claude-desktop-json").map((s) => s.name).sort()).toEqual([
        "bare",
        "broken",
        "filesystem",
        "remote",
      ]);
      expect(on.findings.map((f) => f.ruleId)).toEqual(["claude-desktop.mcp.no-launch"]);
    });
  });

  test("a config with only preferences is not a config error", () => {
    const root = mkPinnedProject("agentscan-desktop-prefs-");
    const home = mkPinnedProject("agentscan-desktop-prefs-home-");
    write(home, ".config/Claude/claude_desktop_config.json", JSON.stringify({ preferences: {} }));
    withHome(home, () => {
      const on = findingsFor(root, true);
      expect(on.facts.configErrors).toEqual([]);
      expect(on.findings).toEqual([]);
    });
  });

  test("extension manifests: 0.3 and 0.4 pass; missing fields and unknown server.type are claude-desktop.extension.missing-field", () => {
    const root = mkPinnedProject("agentscan-desktop-ext-");
    const home = mkPinnedProject("agentscan-desktop-ext-home-");
    const ext = ".config/Claude/Claude Extensions";
    write(home, `${ext}/ok-03/manifest.json`, manifest({ manifest_version: "0.3", server: { type: "node" }, extra: 1 }));
    write(home, `${ext}/ok-04/manifest.json`, manifest({}));
    write(home, `${ext}/no-author/manifest.json`, manifest({ author: undefined, description: "" }));
    write(home, `${ext}/bad-type/manifest.json`, manifest({ server: { type: "deno" } }));
    withHome(home, () => {
      expect(findingsFor(root, false).findings).toEqual([]);
      const found = findingsFor(root, true).findings.filter(
        (f) => f.ruleId === "claude-desktop.extension.missing-field",
      );
      expect(found.map((f) => f.message).sort()).toEqual([
        'Claude Desktop extension manifest has unknown server.type "deno"',
        "Claude Desktop extension manifest is missing description, author",
      ]);
    });
  });
});
