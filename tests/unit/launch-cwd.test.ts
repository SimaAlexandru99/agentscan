import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mkPinnedProject } from "../helpers/tmp";
import { analyze } from "../../src/analyze";
import {
  cwdSkipsExistenceCheck,
  isWindowsAbsOrUnc,
  isWindowsDriveRelative,
  pathSkipsExistenceCheck,
  resolveLaunchCwd,
} from "../../src/discover/launch";

function tmpProject(prefix: string): string {
  return mkPinnedProject(prefix, "launch-cwd");
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

  test("Windows drive cwd is not joined as a POSIX relative path", () => {
    expect(isWindowsAbsOrUnc("C:\\Users\\me\\app")).toBe(true);
    expect(isWindowsAbsOrUnc("D:/tools")).toBe(true);
    expect(isWindowsAbsOrUnc("\\\\server\\share\\hooks")).toBe(true);
    expect(isWindowsAbsOrUnc("//server/share/hooks")).toBe(true);
    expect(isWindowsAbsOrUnc("./runtime")).toBe(false);
    expect(isWindowsAbsOrUnc("/home/me/app")).toBe(false);
    expect(isWindowsAbsOrUnc("C:relative")).toBe(false);
    expect(isWindowsDriveRelative("C:relative")).toBe(true);
    expect(isWindowsDriveRelative("C:\\Users\\me\\app")).toBe(false);

    expect(resolveLaunchCwd("C:\\Users\\me\\app", "/tmp/proj", "linux")).toEqual({
      status: "foreign",
    });
    expect(resolveLaunchCwd("D:/tools", "/tmp/proj", "linux")).toEqual({
      status: "foreign",
    });
    expect(resolveLaunchCwd("\\\\server\\share\\hooks", "/tmp/proj", "darwin")).toEqual({
      status: "foreign",
    });
    expect(resolveLaunchCwd("//server/share/hooks", "/tmp/proj", "linux")).toEqual({
      status: "foreign",
    });
    expect(resolveLaunchCwd("C:\\Users\\me\\app", "C:\\repo", "win32")).toEqual({
      status: "ok",
      abs: "C:\\Users\\me\\app",
    });
    expect(resolveLaunchCwd("./runtime", "/tmp/proj", "linux").status).toBe("ok");
    expect(resolveLaunchCwd("C:relative", "/tmp/proj", "linux")).toEqual({
      status: "unresolved",
    });
    expect(resolveLaunchCwd("/home/me/app", "C:\\repo", "win32")).toEqual({
      status: "foreign",
    });
    expect(pathSkipsExistenceCheck("/home/me/bin/format.sh", "win32")).toBe(true);
    expect(pathSkipsExistenceCheck("C:\\Users\\me\\format.ps1", "linux")).toBe(true);
    expect(cwdSkipsExistenceCheck({ status: "foreign" })).toBe(true);
    expect(cwdSkipsExistenceCheck({ status: "unresolved" })).toBe(true);
    expect(cwdSkipsExistenceCheck({ status: "ok", abs: "/tmp/proj/runtime" })).toBe(false);
  });

  test.skipIf(process.platform === "win32")(
    "VS Code hook Windows cwd does not emit a false missing-script on POSIX",
    () => {
    const root = tmpProject("agentscan-cwd-win-hook-");
    write(
      root,
      ".github/hooks/guard.json",
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              type: "command",
              command: "node",
              args: ["./missing.js"],
              cwd: "C:\\Users\\me\\hooks",
              windows: {
                command: "node",
                args: ["./missing.js"],
                cwd: "\\\\server\\share\\hooks",
              },
            },
          ],
        },
      }),
    );
    const analysis = analyze({ dir: root });
    expect(analysis.facts.hooks.map((hook) => hook.cwd).sort()).toEqual([
      "C:\\Users\\me\\hooks",
      "\\\\server\\share\\hooks",
    ]);
    expect(analysis.facts.hooks.every((hook) => hook.scriptExists === undefined)).toBe(true);
    expect(ruleIds(root)).not.toContain("vscode.hook.missing-script");
  });

  test.skipIf(process.platform === "win32")(
    "MCP Windows cwd does not emit a false command-missing on POSIX",
    () => {
    const root = tmpProject("agentscan-cwd-win-mcp-");
    write(
      root,
      ".vscode/mcp.json",
      JSON.stringify({
        servers: {
          docs: {
            command: ["node", "./missing.js"],
            cwd: "D:/tools/mcp",
            windows: {
              command: ["node", "./missing.js"],
              cwd: "\\\\filesrv\\mcp\\bin",
            },
          },
        },
      }),
    );
    const analysis = analyze({ dir: root });
    expect(analysis.facts.mcp.every((server) => server.commandExists === undefined)).toBe(true);
    expect(ruleIds(root)).not.toContain("mcp.command-missing");
  });
});
