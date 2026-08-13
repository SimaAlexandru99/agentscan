import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runChecks } from "../../src/checks/index";
import { defaultConfig } from "../../src/config/schema";
import { discoverMcp, mcpCommandPath } from "../../src/discover/index";
import { extractFacts } from "../../src/facts/extract";
import type { ConfigErrorFact } from "../../src/facts/types";

describe("mcpCommandPath", () => {
  test("accepts path-like values only", () => {
    expect(mcpCommandPath("./bin/server")).toBe("./bin/server");
    expect(mcpCommandPath("bin/server")).toBe("bin/server");
    expect(mcpCommandPath("/usr/local/bin/server")).toBe("/usr/local/bin/server");
    expect(mcpCommandPath("$CLAUDE_PROJECT_DIR/bin/server")).toBe(
      "$CLAUDE_PROJECT_DIR/bin/server",
    );
  });

  test("skips bare binaries, shell, and unresolved env", () => {
    expect(mcpCommandPath("npx")).toBeUndefined();
    expect(mcpCommandPath("uvx")).toBeUndefined();
    expect(mcpCommandPath("node")).toBeUndefined();
    expect(mcpCommandPath("npx -y pkg")).toBeUndefined();
    expect(mcpCommandPath("${CLAUDE_PLUGIN_ROOT}/servers/db")).toBeUndefined();
    expect(mcpCommandPath("a && b")).toBeUndefined();
  });
});

describe("mcp.command-missing discovery", () => {
  test("flags a missing relative command and ignores npx", () => {
    const root = mkdtempSync(join(tmpdir(), "agentscan-mcp-cmd-"));
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

    const errors: ConfigErrorFact[] = [];
    const facts = discoverMcp(root, defaultConfig.mcpPaths, errors);
    const gone = facts.find((f) => f.name === "gone");
    const ok = facts.find((f) => f.name === "ok");
    expect(gone?.commandExists).toBe(false);
    expect(ok?.commandExists).toBeUndefined();

    const findings = runChecks(
      extractFacts(root, defaultConfig, { includeGlobal: false }),
    );
    expect(findings.map((f) => f.ruleId)).toContain("mcp.command-missing");
    expect(
      findings.some(
        (f) => f.ruleId === "mcp.command-missing" && f.message.includes("npx"),
      ),
    ).toBe(false);
  });

  test("does not flag when the command file exists", () => {
    const root = mkdtempSync(join(tmpdir(), "agentscan-mcp-ok-"));
    mkdirSync(join(root, "bin"), { recursive: true });
    writeFileSync(join(root, "bin", "server.js"), "#!/usr/bin/env node\n", "utf8");
    writeFileSync(
      join(root, ".mcp.json"),
      JSON.stringify({
        mcpServers: { local: { command: "./bin/server.js" } },
      }),
      "utf8",
    );

    const findings = runChecks(
      extractFacts(root, defaultConfig, { includeGlobal: false }),
    );
    expect(findings.map((f) => f.ruleId)).not.toContain("mcp.command-missing");
  });
});
