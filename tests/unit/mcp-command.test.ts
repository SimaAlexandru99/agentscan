import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mcpCommandPath } from "../../src/discover/mcp";
import { mkPinnedRoot } from "../helpers/tmp";
import { findingsFor } from "../helpers/scan";

describe("mcpCommandPath", () => {
  test("accepts path-like values only", () => {
    expect(mcpCommandPath("./bin/server")).toBe("./bin/server");
    expect(mcpCommandPath("bin/server")).toBe("bin/server");
    expect(mcpCommandPath("/usr/local/bin/server")).toBe("/usr/local/bin/server");
    expect(mcpCommandPath("$CLAUDE_PROJECT_DIR/bin/server")).toBe(
      "$CLAUDE_PROJECT_DIR/bin/server",
    );
    expect(mcpCommandPath("$COMMANDCODE_PROJECT_DIR/bin/server")).toBe(
      "$COMMANDCODE_PROJECT_DIR/bin/server",
    );
  });

  test("skips bare binaries, shell, and unresolved env", () => {
    expect(mcpCommandPath("npx")).toBeUndefined();
    expect(mcpCommandPath("uvx")).toBeUndefined();
    expect(mcpCommandPath("node")).toBeUndefined();
    expect(mcpCommandPath(".")).toBeUndefined();
    expect(mcpCommandPath("..")).toBeUndefined();
    expect(mcpCommandPath("npx -y pkg")).toBeUndefined();
    expect(mcpCommandPath("${CLAUDE_PLUGIN_ROOT}/servers/db")).toBeUndefined();
    expect(mcpCommandPath("a && b")).toBeUndefined();
  });
});

describe("mcp.command-missing discovery", () => {
  test("flags a missing relative command and ignores npx", () => {
    const root = mkPinnedRoot("agentscan-mcp-cmd-");
    writeFileSync(
      join(root, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          gone: { command: "./bin/missing-server" },
          ok: { command: "npx", args: ["-y", "some-mcp"] },
        },
      }),
      "utf8",
    );

    const analysis = findingsFor(root);
    const gone = analysis.facts.mcp.find((f) => f.name === "gone");
    const ok = analysis.facts.mcp.find((f) => f.name === "ok");
    expect(gone?.commandExists).toBe(false);
    expect(ok?.commandExists).toBeUndefined();

    expect(analysis.findings.map((f) => f.ruleId)).toContain("mcp.command-missing");
    expect(
      analysis.findings.some(
        (f) => f.ruleId === "mcp.command-missing" && f.message.includes("npx"),
      ),
    ).toBe(false);
  });

  test("does not flag when the command file exists", () => {
    const root = mkPinnedRoot("agentscan-mcp-ok-");
    mkdirSync(join(root, "bin"), { recursive: true });
    writeFileSync(join(root, "bin", "server.js"), "#!/usr/bin/env node\n", "utf8");
    writeFileSync(
      join(root, ".mcp.json"),
      JSON.stringify({
        mcpServers: { local: { command: "./bin/server.js" } },
      }),
      "utf8",
    );

    expect(findingsFor(root).findings.map((f) => f.ruleId)).not.toContain("mcp.command-missing");
  });
});
