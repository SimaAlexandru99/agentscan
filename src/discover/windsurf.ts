import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import type { ConfigErrorFact, HookFact, McpFact, RuleFact } from "../facts/types";
import { hookScriptPath } from "./launch";
import { parseWindsurfJsonFile } from "./mcp";
import { discoverWindsurfGlobalRules as readGlobalRules } from "./rules";
import { readJsonConfig } from "./shared";

/** Quoted event table on https://docs.devin.ai/desktop/cascade/hooks (read 2026-08-31). */
export const WINDSURF_HOOK_EVENTS = new Set([
  "pre_read_code",
  "post_read_code",
  "pre_write_code",
  "post_write_code",
  "pre_run_command",
  "post_run_command",
  "pre_mcp_tool_use",
  "post_mcp_tool_use",
  "pre_user_prompt",
  "post_cascade_response",
  "post_cascade_response_with_transcript",
  "post_setup_worktree",
]);

export function windsurfUserHooksPath(home = homedir()): string {
  return join(home, ".codeium", "windsurf", "hooks.json");
}

/** Quoted global skills dir. Only opened under `--global`. */
export function windsurfUserSkillsPath(home = homedir()): string {
  return join(home, ".codeium", "windsurf", "skills");
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * Workspace `.windsurf/hooks.json` or the `--global` user file.
 * See docs/spec/windsurf-hooks.md.
 */
export function discoverWindsurfHooksFile(
  filePath: string,
  projectRoot: string,
  errors: ConfigErrorFact[],
): HookFact[] {
  if (!existsSync(filePath)) {
    return [];
  }
  const raw = readJsonConfig(filePath, errors);
  if (raw === undefined) {
    return [];
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    errors.push({
      path: filePath,
      kind: "unexpected-shape",
      detail: "hooks.json is not a JSON object",
    });
    return [];
  }
  const hooks = (raw as Record<string, unknown>).hooks;
  if (hooks === undefined) {
    return [];
  }
  if (hooks === null || typeof hooks !== "object" || Array.isArray(hooks)) {
    errors.push({
      path: filePath,
      kind: "unexpected-shape",
      detail: "hooks is not a JSON object",
    });
    return [];
  }
  const facts: HookFact[] = [];
  const hostWin = process.platform === "win32";
  for (const [event, value] of Object.entries(hooks as Record<string, unknown>)) {
    if (!Array.isArray(value)) {
      errors.push({
        path: filePath,
        kind: "unexpected-shape",
        detail: `${event} hook list is not an array`,
      });
      continue;
    }
    for (const item of value) {
      if (item === null || typeof item !== "object" || Array.isArray(item)) {
        facts.push({
          name: event,
          path: filePath,
          event,
          source: "windsurf-hooks",
          sourceProvider: "windsurf",
          schemaProfile: "windsurf",
          defect: "command-without-command",
        });
        continue;
      }
      const rec = item as Record<string, unknown>;
      const command = typeof rec.command === "string" ? rec.command : undefined;
      const powershell = typeof rec.powershell === "string" ? rec.powershell : undefined;
      if (
        (command === undefined || command.length === 0) &&
        (powershell === undefined || powershell.length === 0)
      ) {
        facts.push({
          name: event,
          path: filePath,
          event,
          source: "windsurf-hooks",
          sourceProvider: "windsurf",
          schemaProfile: "windsurf",
          handlerType: "command",
          defect: "command-without-command",
        });
        continue;
      }
      const chosen = hostWin ? (powershell ?? command) : command;
      const fact: HookFact = {
        name: event,
        path: filePath,
        event,
        source: "windsurf-hooks",
        sourceProvider: "windsurf",
        schemaProfile: "windsurf",
        handlerType: "command",
        ...(chosen === undefined ? {} : { command: chosen }),
      };
      if (chosen === undefined) {
        facts.push(fact);
        continue;
      }
      const extracted = hookScriptPath(chosen);
      if (extracted === undefined) {
        facts.push(fact);
        continue;
      }
      const abs = isAbsolute(extracted)
        ? extracted
        : join(projectRoot, extracted);
      facts.push({
        ...fact,
        scriptPath: extracted,
        scriptExists: isFile(abs),
      });
    }
  }
  return facts;
}

/**
 * Cascade user MCP. Only called under `--global`.
 * See docs/spec/windsurf-mcp.md.
 */
export function windsurfUserMcpPath(home = homedir()): string {
  return join(home, ".codeium", "windsurf", "mcp_config.json");
}

/**
 * Quoted global rules file. Only called under `--global`.
 * See docs/spec/windsurf-rules.md.
 */
export function windsurfGlobalRulesPath(home = homedir()): string {
  return join(home, ".codeium", "windsurf", "memories", "global_rules.md");
}

export function discoverWindsurfUserMcp(errors: ConfigErrorFact[]): McpFact[] {
  const filePath = windsurfUserMcpPath();
  if (!existsSync(filePath)) {
    return [];
  }
  return parseWindsurfJsonFile(filePath, dirname(filePath), errors);
}

export function discoverWindsurfUserRules(errors: ConfigErrorFact[]): RuleFact[] {
  return readGlobalRules(windsurfGlobalRulesPath(), errors);
}
