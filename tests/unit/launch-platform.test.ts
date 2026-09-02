import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mkPinnedProject } from "../helpers/tmp";
import { analyze } from "../../src/analyze";
import { hooksFromObject } from "../../src/discover/hooks";
import {
  launchMatchesHost,
  skipLaunchExistenceCheck,
  resolveLaunchCwd,
  scriptCandidateFromLaunch,
} from "../../src/discover/launch";
import type { ConfigErrorFact } from "../../src/facts/types";

function tmpProject(prefix: string): string {
  return mkPinnedProject(prefix, "launch-platform");
}

function write(root: string, rel: string, body: string): void {
  const abs = join(root, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, body, "utf8");
}

function hostOsKey(): "windows" | "linux" | "osx" {
  if (process.platform === "win32") {
    return "windows";
  }
  if (process.platform === "darwin") {
    return "osx";
  }
  return "linux";
}

function ruleIds(dir: string): string[] {
  return analyze({ dir }).findings.map((finding) => finding.ruleId);
}

describe("OS-specific launch existence checks", () => {
  test("launchMatchesHost treats platform-neutral as matching every host", () => {
    expect(launchMatchesHost({}, "linux")).toBe(true);
    expect(launchMatchesHost({ platform: "windows" }, "linux")).toBe(false);
    expect(launchMatchesHost({ platform: "windows" }, "win32")).toBe(true);
    expect(launchMatchesHost({ platform: "osx" }, "darwin")).toBe(true);
  });

  test.skipIf(process.platform === "win32")(
    "official VS Code Windows hook example does not emit missing-script on POSIX",
    () => {
      const root = tmpProject("agentscan-vscode-official-win-");
      write(root, "scripts/format.sh", "#!/bin/sh\n");
      write(
        root,
        ".github/hooks/format.json",
        JSON.stringify({
          hooks: {
            PostToolUse: [
              {
                type: "command",
                command: "./scripts/format.sh",
                windows: "powershell -File scripts\\format.ps1",
              },
            ],
          },
        }),
      );
      const analysis = analyze({ dir: root });
      const windows = analysis.facts.hooks.find((hook) => hook.platform === "windows");
      expect(windows?.command).toBe("powershell -File scripts\\format.ps1");
      expect(windows?.scriptExists).toBeUndefined();
      expect(ruleIds(root)).not.toContain("vscode.hook.missing-script");
    },
  );

  test.skipIf(process.platform === "win32")(
    "scripts\\format.ps1 is not checked as a POSIX filename",
    () => {
      const root = tmpProject("agentscan-win-rel-ps1-");
      write(root, "scripts/format.ps1", "Write-Output ok\n");
      write(
        root,
        ".github/hooks/format.json",
        JSON.stringify({
          hooks: {
            PostToolUse: [
              {
                type: "command",
                command: "true",
                windows: "powershell -File scripts\\format.ps1",
              },
            ],
          },
        }),
      );
      const analysis = analyze({ dir: root });
      const windows = analysis.facts.hooks.find((hook) => hook.platform === "windows");
      expect(scriptCandidateFromLaunch({
        executable: "powershell -File scripts\\format.ps1",
        args: [],
        platform: "windows",
      })).toBe("scripts\\format.ps1");
      expect(windows?.scriptExists).toBeUndefined();
      expect(ruleIds(root)).not.toContain("vscode.hook.missing-script");
    },
  );

  test.skipIf(process.platform === "win32")(
    ".\\scripts\\format.ps1 Windows hook is inventoried and not existence-checked",
    () => {
      const root = tmpProject("agentscan-win-dot-ps1-");
      write(
        root,
        ".github/hooks/format.json",
        JSON.stringify({
          hooks: {
            PostToolUse: [
              {
                type: "command",
                command: "true",
                windows: "powershell -File .\\scripts\\format.ps1",
              },
            ],
          },
        }),
      );
      const analysis = analyze({ dir: root });
      const windows = analysis.facts.hooks.find((hook) => hook.platform === "windows");
      expect(windows?.command).toContain(".\\scripts\\format.ps1");
      expect(windows?.scriptExists).toBeUndefined();
      expect(ruleIds(root)).not.toContain("vscode.hook.missing-script");
    },
  );

  test.skipIf(process.platform === "win32")(
    "Windows UNC script path is inventoried and not existence-checked",
    () => {
      const root = tmpProject("agentscan-win-unc-script-");
      write(
        root,
        ".github/hooks/format.json",
        JSON.stringify({
          hooks: {
            PostToolUse: [
              {
                type: "command",
                command: "true",
                windows: "powershell -File \\\\server\\share\\format.ps1",
              },
            ],
          },
        }),
      );
      const analysis = analyze({ dir: root });
      const windows = analysis.facts.hooks.find((hook) => hook.platform === "windows");
      expect(windows?.command).toContain("\\\\server\\share\\format.ps1");
      expect(windows?.scriptExists).toBeUndefined();
      expect(ruleIds(root)).not.toContain("vscode.hook.missing-script");
    },
  );

  test("Linux absolute script and cwd are skipped when the host is Windows", () => {
    const errors: ConfigErrorFact[] = [];
    const facts = hooksFromObject(
      {
        PostToolUse: [
          {
            type: "command",
            command: "./scripts/format.sh",
            linux: {
              command: "/home/me/bin/format.sh",
              cwd: "/home/me/app",
            },
          },
        ],
      },
      "/tmp/hooks.json",
      "vscode-hooks",
      { project: "/tmp/proj" },
      errors,
      "vscode",
      "win32",
    );
    const linux = facts.find((hook) => hook.platform === "linux");
    expect(linux?.command).toBe("/home/me/bin/format.sh");
    expect(linux?.cwd).toBe("/home/me/app");
    expect(linux?.scriptExists).toBeUndefined();
    expect(resolveLaunchCwd("/home/me/app", "C:\\repo", "win32")).toEqual({
      status: "foreign",
    });
    expect(
      skipLaunchExistenceCheck(
        { executable: "/home/me/bin/format.sh", args: [], platform: "linux" },
        resolveLaunchCwd("/home/me/app", "C:\\repo", "win32"),
        "/home/me/bin/format.sh",
        "win32",
      ),
    ).toBe(true);
  });

  test("host-matching hook override still reports a genuinely missing script", () => {
    const root = tmpProject("agentscan-host-missing-hook-");
    const os = hostOsKey();
    write(
      root,
      ".github/hooks/format.json",
      JSON.stringify({
        hooks: {
          PostToolUse: [
            {
              type: "command",
              command: "true",
              [os]: {
                command: "node",
                args: ["./scripts/missing-host.js"],
              },
            },
          ],
        },
      }),
    );
    const analysis = analyze({ dir: root });
    const host = analysis.facts.hooks.find((hook) => hook.platform === os);
    expect(host?.scriptExists).toBe(false);
    expect(ruleIds(root)).toContain("vscode.hook.missing-script");
  });

  test.skipIf(process.platform === "win32")(
    "MCP Windows script variants are inventoried and not existence-checked on POSIX",
    () => {
      const root = tmpProject("agentscan-mcp-win-script-");
      write(
        root,
        ".vscode/mcp.json",
        JSON.stringify({
          servers: {
            docs: {
              command: ["node", "./servers/ok.js"],
              windows: {
                command: ["node", ".\\scripts\\format.ps1"],
              },
            },
            unc: {
              command: ["node", "./servers/ok.js"],
              windows: {
                command: ["node", "\\\\server\\share\\mcp.js"],
              },
            },
          },
        }),
      );
      write(root, "servers/ok.js", "export {}\n");
      const analysis = analyze({ dir: root });
      const windows = analysis.facts.mcp.filter((server) => server.platform === "windows");
      expect(windows).toHaveLength(2);
      expect(windows.every((server) => server.commandExists === undefined)).toBe(true);
      expect(ruleIds(root)).not.toContain("mcp.command-missing");
    },
  );

  test("host-matching MCP override still reports a genuinely missing command", () => {
    const root = tmpProject("agentscan-host-missing-mcp-");
    const os = hostOsKey();
    write(
      root,
      ".vscode/mcp.json",
      JSON.stringify({
        servers: {
          docs: {
            command: ["node", "./servers/ok.js"],
            [os]: {
              command: ["node", "./servers/missing-host.js"],
            },
          },
        },
      }),
    );
    write(root, "servers/ok.js", "export {}\n");
    const analysis = analyze({ dir: root });
    const host = analysis.facts.mcp.find((server) => server.platform === os);
    expect(host?.commandExists).toBe(false);
    expect(ruleIds(root)).toContain("mcp.command-missing");
  });
});
