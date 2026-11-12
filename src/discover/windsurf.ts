import { dirname, join } from "node:path";
import { providerHome } from "../facts/providers";
import type { HookFact, McpFact, RuleFact } from "../facts/types";
import { commandHook, readFlatHooks } from "./hooks";
import { checkCommandScript, withScriptCheck } from "./launch";
import { parseWindsurfJsonFile } from "./mcp";
import { discoverWindsurfGlobalRules as readGlobalRules } from "./rules";
import { isRecord, type ScanIO } from "./fs";

export function windsurfUserHooksPath(): string {
  return join(providerHome("windsurf"), "hooks.json");
}

/**
 * Workspace `.windsurf/hooks.json` or the `--global` user file.
 * See docs/spec/windsurf-hooks.md.
 */
export function discoverWindsurfHooksFile(
  filePath: string,
  projectRoot: string,
  io: ScanIO,
): HookFact[] {
  return readFlatHooks(filePath, "windsurf", io, (item, base, hostPlatform) => {
    if (!isRecord(item)) {
      return base({ defect: "command-without-command" });
    }
    const command = typeof item.command === "string" ? item.command : undefined;
    const powershell = typeof item.powershell === "string" ? item.powershell : undefined;
    if (
      (command === undefined || command.length === 0) &&
      (powershell === undefined || powershell.length === 0)
    ) {
      return base({ handlerType: "command", defect: "command-without-command" });
    }
    const chosen = hostPlatform === "win32" ? (powershell ?? command) : command;
    if (chosen === undefined) {
      return base({ handlerType: "command" });
    }
    // An empty string is still the chosen field (the other one was set, for the
    // other platform). Keep it as a command rather than `command-without-command`.
    if (chosen.length === 0) {
      return withScriptCheck(
        base({ handlerType: "command", command: chosen }),
        checkCommandScript(chosen, { project: projectRoot }),
      );
    }
    return commandHook(base(), chosen, projectRoot);
  });
}

/**
 * Cascade user MCP. Only called under `--global`.
 * See docs/spec/windsurf-mcp.md.
 */
function windsurfUserMcpPath(): string {
  return join(providerHome("windsurf"), "mcp_config.json");
}

/**
 * Quoted global rules file. Only called under `--global`.
 * See docs/spec/windsurf-rules.md.
 */
function windsurfGlobalRulesPath(): string {
  return join(providerHome("windsurf"), "memories", "global_rules.md");
}

export function discoverWindsurfUserMcp(io: ScanIO): McpFact[] {
  const filePath = windsurfUserMcpPath();
  return parseWindsurfJsonFile(filePath, dirname(filePath), io, { optional: true });
}

export function discoverWindsurfUserRules(io: ScanIO): RuleFact[] {
  return readGlobalRules(windsurfGlobalRulesPath(), io);
}
