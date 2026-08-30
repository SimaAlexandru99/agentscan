import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyze } from "../../src/analyze";

function tmpProject(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  writeFileSync(join(root, "package.json"), '{"name":"launch-cwd"}', "utf8");
  return root;
}

function write(root: string, rel: string, body: string): void {
  const abs = join(root, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, body, "utf8");
}

function ruleIds(dir: string): string[] {
  return analyze({ dir }).findings.map((finding) => finding.ruleId);
}

describe("launch cwd resolution", () => {
  test("hook command + args + cwd resolves the script against cwd", () => {
    const root = tmpProject("agentscan-cwd-hook-");
    write(root, "runtime/guard.js", "export {}\n");
    write(
      root,
      ".github/hooks/guard.json",
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              type: "command",
              command: "node",
              args: ["./guard.js"],
              cwd: "./runtime",
            },
          ],
        },
      }),
    );
    expect(ruleIds(root)).not.toContain("vscode.hook.missing-script");
  });

  test("MCP command array + cwd path-checks against cwd", () => {
    const root = tmpProject("agentscan-cwd-mcp-");
    write(root, "servers/mcp.js", "export {}\n");
    write(root, "mcp.js", "export {}\n");
    write(
      root,
      ".vscode/mcp.json",
      JSON.stringify({
        servers: {
          docs: { command: ["node", "./mcp.js"], cwd: "./servers" },
        },
      }),
    );
    expect(ruleIds(root)).not.toContain("mcp.command-missing");

    const missing = tmpProject("agentscan-cwd-mcp-miss-");
    write(
      missing,
      ".vscode/mcp.json",
      JSON.stringify({
        servers: {
          docs: { command: ["node", "./mcp.js"], cwd: "./servers" },
        },
      }),
    );
    expect(ruleIds(missing)).toContain("mcp.command-missing");
  });

  test("OS override + cwd path-checks that override against its cwd", () => {
    const root = tmpProject("agentscan-cwd-os-");
    write(root, "linux-runtime/hook.js", "export {}\n");
    write(
      root,
      ".github/hooks/os.json",
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              type: "command",
              command: "node",
              args: ["./hook.js"],
              cwd: "./missing-default",
              linux: { cwd: "./linux-runtime" },
            },
          ],
        },
      }),
    );
    const findings = analyze({ dir: root }).findings.filter(
      (finding) => finding.ruleId === "vscode.hook.missing-script",
    );
    expect(findings.map((finding) => finding.subject)).toEqual([
      "hook:PreToolUse:./hook.js",
    ]);
    const linux = analyze({ dir: root }).facts.hooks.find(
      (hook) => hook.platform === "linux",
    );
    expect(linux?.cwd).toBe("./linux-runtime");
    expect(linux?.scriptExists).toBe(true);
  });

  test("unresolved interpolated cwd does not emit a false missing-script", () => {
    const root = tmpProject("agentscan-cwd-interp-");
    write(
      root,
      ".github/hooks/interp.json",
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              type: "command",
              command: "node",
              args: ["./missing.js"],
              cwd: "${workspaceFolder}/hooks",
            },
          ],
        },
      }),
    );
    write(
      root,
      ".vscode/mcp.json",
      JSON.stringify({
        servers: {
          docs: {
            command: ["node", "./missing.js"],
            cwd: "${env:HOME}/servers",
          },
        },
      }),
    );
    const ids = ruleIds(root);
    expect(ids).not.toContain("vscode.hook.missing-script");
    expect(ids).not.toContain("mcp.command-missing");
  });
});
