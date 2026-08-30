import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import type { ConfigErrorFact, HookFact } from "../facts/types";
import type { Provider } from "../facts/provider";
import {
  formatLaunch,
  launchesFromEntry,
  resolveLaunchCwd,
  scriptCandidateFromLaunch,
} from "./launch";
import { readJsonConfig } from "./shared";

export { hookScriptPath } from "./launch";

/**
 * Where a hook's script paths resolve from.
 *
 * Each documented hook source defines a different set, so this is passed in
 * rather than assumed: `${CLAUDE_PLUGIN_ROOT}` means something in a plugin's
 * `hooks/hooks.json` and nothing at all in a settings file, where expanding it
 * against the project root would be an invented answer.
 *
 * See docs/spec/hook-sources.md.
 */
export type HookBases = {
  /** `${CLAUDE_PROJECT_DIR}`, and the fallback base for a bare relative path. */
  project: string;
  /** `${CLAUDE_PLUGIN_ROOT}` — absent unless the hook came from a plugin. */
  plugin?: string;
  /** The declaring file's own directory, tried first for a relative path. */
  own?: string;
};

const PROJECT_DIR = /^\$(?:CLAUDE_PROJECT_DIR\b|\{CLAUDE_PROJECT_DIR\})/;
const PLUGIN_ROOT = /^\$(?:CLAUDE_PLUGIN_ROOT\b|\{CLAUDE_PLUGIN_ROOT\})/;

/**
 * Pull the script path out of a hook command, so a hook whose script is gone can
 * be reported. Returns undefined whenever the answer is not certain.
 *
 * Deliberately conservative: a wrong "this hook is broken" on a guard hook is as
 * damaging as missing a real one. Shell programs (`a && b`, `$(...)`, pipes) are
 * skipped outright, because a command like `[ ! -f x ] || node x` handles the
 * missing file itself and flagging it would be a false positive.
 */
// hookScriptPath lives in launch.ts so MCP and hooks share one argv walker.

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function resolveHookScript(
  bases: HookBases,
  extracted: string,
  cwdAbs?: string,
): { scriptPath: string; exists: boolean } | undefined {
  if (extracted.startsWith("~/")) {
    return {
      scriptPath: extracted,
      exists: isFile(join(homedir(), extracted.slice(2))),
    };
  }
  if (PROJECT_DIR.test(extracted)) {
    const rel = extracted.replace(
      /^\$(?:CLAUDE_PROJECT_DIR|\{CLAUDE_PROJECT_DIR\})\/?/,
      "",
    );
    return { scriptPath: extracted, exists: isFile(join(bases.project, rel)) };
  }
  if (bases.plugin !== undefined && PLUGIN_ROOT.test(extracted)) {
    const rel = extracted.replace(
      /^\$(?:CLAUDE_PLUGIN_ROOT|\{CLAUDE_PLUGIN_ROOT\})\/?/,
      "",
    );
    return { scriptPath: extracted, exists: isFile(join(bases.plugin, rel)) };
  }
  if (isAbsolute(extracted)) {
    return { scriptPath: extracted, exists: isFile(extracted) };
  }
  if (cwdAbs !== undefined) {
    return { scriptPath: extracted, exists: isFile(join(cwdAbs, extracted)) };
  }
  // A bare relative path has no documented base — the placeholders above exist
  // precisely because the working directory is not guaranteed. Try the
  // declaring file's own directory and the project root, and call it missing
  // only when it is at neither. Same two-base rule as skill.broken-reference;
  // see docs/spec/hook-sources.md for why this one is a judgement, not a quote.
  const candidates = [
    ...(bases.own === undefined ? [] : [join(bases.own, extracted)]),
    join(bases.project, extracted),
  ];
  return { scriptPath: extracted, exists: candidates.some(isFile) };
}

/**
 * Turn one `hooks` object into facts, whatever file it came from.
 *
 * Settings files, a plugin's `hooks/hooks.json` and skill / subagent
 * frontmatter all carry the identical structure — "the same configuration
 * format as settings-based hooks" — so they share one reader and differ only in
 * their `source` label and their path bases. See docs/spec/hook-sources.md.
 */
const HANDLER_TYPES = new Set(["command", "http", "mcp_tool", "mcp-tool", "prompt", "agent"]);

function normalizeHandlerType(type: string): NonNullable<HookFact["handlerType"]> | undefined {
  if (type === "mcp-tool" || type === "mcp_tool") {
    return "mcp_tool";
  }
  if (type === "command" || type === "http" || type === "prompt" || type === "agent") {
    return type;
  }
  return undefined;
}

function handlerTypeOf(item: Record<string, unknown>): HookFact["handlerType"] {
  if (typeof item.type === "string") {
    return normalizeHandlerType(item.type);
  }
  if (item.command !== undefined || item.args !== undefined) {
    return "command";
  }
  if (typeof item.url === "string") {
    return "http";
  }
  return undefined;
}

function isMatcherOnlyGroup(group: Record<string, unknown>): boolean {
  return (
    group.matcher !== undefined &&
    group.type === undefined &&
    group.command === undefined &&
    group.url === undefined
  );
}

function isHandlerEntry(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function handlersFromGroups(groups: unknown): Record<string, unknown>[] {
  if (!Array.isArray(groups)) {
    return [];
  }
  const first = groups[0];
  if (
    isHandlerEntry(first) &&
    (first.type !== undefined ||
      first.command !== undefined ||
      first.url !== undefined ||
      first.args !== undefined) &&
    !Array.isArray(first.hooks)
  ) {
    return groups.filter(isHandlerEntry);
  }
  const out: Record<string, unknown>[] = [];
  for (const group of groups) {
    if (!isHandlerEntry(group)) {
      continue;
    }
    const inner = group.hooks;
    if (!Array.isArray(inner)) {
      continue;
    }
    for (const entry of inner) {
      if (isHandlerEntry(entry)) {
        out.push(entry);
      }
    }
  }
  return out;
}

export function hooksFromObject(
  hooks: unknown,
  filePath: string,
  source: NonNullable<HookFact["source"]>,
  bases: HookBases,
  errors: ConfigErrorFact[],
  sourceProvider: Provider = "claude",
): HookFact[] {
  if (hooks === null || typeof hooks !== "object" || Array.isArray(hooks)) {
    errors.push({
      path: filePath,
      kind: "unexpected-shape",
      detail: "`hooks` is not an object",
    });
    return [];
  }

  const facts: HookFact[] = [];
  for (const [event, groups] of Object.entries(
    hooks as Record<string, unknown>,
  )) {
    if (!Array.isArray(groups)) {
      errors.push({ path: filePath, kind: "unexpected-shape", detail: `invalid hook groups for ${event}` });
      continue;
    }

    let invalidGroup = false;
    for (const group of groups) {
      if (!isHandlerEntry(group)) {
        continue;
      }
      if (isMatcherOnlyGroup(group) && !Array.isArray(group.hooks)) {
        invalidGroup = true;
        facts.push({
          name: event,
          path: filePath,
          event,
          source,
          sourceProvider,
          defect: "invalid-group",
        });
        continue;
      }
      if (Array.isArray(group.hooks) && group.hooks.length === 0) {
        invalidGroup = true;
        facts.push({
          name: event,
          path: filePath,
          event,
          source,
          sourceProvider,
          defect: "invalid-group",
        });
      }
    }

    const handlers = handlersFromGroups(groups);
    if (handlers.length === 0) {
      if (!invalidGroup) {
        facts.push({ name: event, path: filePath, event, source, sourceProvider });
      }
      continue;
    }
    for (const item of handlers) {
      const typeRaw = typeof item.type === "string" ? item.type : undefined;
      if (typeRaw !== undefined && !HANDLER_TYPES.has(typeRaw)) {
        facts.push({
          name: event,
          path: filePath,
          event,
          source,
          sourceProvider,
          defect: "unknown-handler-type",
          unknownHandlerType: typeRaw,
        });
        continue;
      }
      const handlerType = handlerTypeOf(item);
      if (handlerType === "http") {
        const url = typeof item.url === "string" ? item.url : undefined;
        facts.push({
          name: event,
          path: filePath,
          event,
          source,
          sourceProvider,
          handlerType: "http",
          ...(url === undefined || url.length === 0
            ? { defect: "http-without-url" as const }
            : {}),
        });
        continue;
      }
      if (handlerType === "mcp_tool") {
        const toolName =
          (typeof item.name === "string" && item.name.length > 0 && item.name) ||
          (typeof item.toolName === "string" && item.toolName.length > 0 && item.toolName) ||
          (typeof item.mcp_tool === "string" && item.mcp_tool.length > 0 && item.mcp_tool) ||
          undefined;
        facts.push({
          name: event,
          path: filePath,
          event,
          source,
          sourceProvider,
          handlerType: "mcp_tool",
          ...(toolName === undefined ? { defect: "mcp-tool-without-name" as const } : {}),
        });
        continue;
      }
      if (handlerType === "prompt" || handlerType === "agent") {
        facts.push({
          name: event,
          path: filePath,
          event,
          source,
          sourceProvider,
          handlerType,
        });
        continue;
      }

      const launches = launchesFromEntry(item);
      if (launches.length === 0 && (handlerType === "command" || typeRaw === "command")) {
        facts.push({
          name: event,
          path: filePath,
          event,
          source,
          sourceProvider,
          handlerType: "command",
          defect: "command-without-command",
        });
        continue;
      }
      if (launches.length === 0) {
        facts.push({ name: event, path: filePath, event, source, sourceProvider });
        continue;
      }
      for (const launch of launches) {
        const command = formatLaunch(launch);
        const fact: HookFact = {
          name: event,
          path: filePath,
          event,
          source,
          sourceProvider,
          handlerType: "command",
          command,
          ...(launch.platform === undefined ? {} : { platform: launch.platform }),
          ...(launch.cwd === undefined ? {} : { cwd: launch.cwd }),
        };
        const cwd = resolveLaunchCwd(launch.cwd, bases.project);
        const candidate = scriptCandidateFromLaunch(launch, bases);
        if (candidate !== undefined && cwd.status !== "unresolved") {
          const resolved = resolveHookScript(
            bases,
            candidate,
            cwd.status === "ok" ? cwd.abs : undefined,
          );
          if (resolved !== undefined) {
            fact.scriptPath = resolved.scriptPath;
            fact.scriptExists = resolved.exists;
          }
        }
        facts.push(fact);
      }
    }
  }
  return facts;
}

export function discoverHooks(
  root: string,
  errors: ConfigErrorFact[],
): HookFact[] {
  const files = [
    join(root, ".claude", "settings.json"),
    join(root, ".claude", "settings.local.json"),
  ];
  const facts: HookFact[] = [];
  for (const filePath of files) {
    if (!existsSync(filePath)) {
      continue;
    }
    const raw = readJsonConfig(filePath, errors);
    if (raw === undefined) {
      continue;
    }
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      errors.push({
        path: filePath,
        kind: "unexpected-shape",
        detail: "settings file is not a JSON object",
      });
      continue;
    }
    const hooks = (raw as Record<string, unknown>).hooks;
    if (hooks === undefined) {
      continue;
    }
    // No plugin base: `${CLAUDE_PLUGIN_ROOT}` in a settings file names nothing.
    facts.push(
      ...hooksFromObject(hooks, filePath, "settings", { project: root }, errors, "claude"),
    );
  }
  return facts;
}

export function discoverVscodeHooks(
  root: string,
  errors: ConfigErrorFact[],
): HookFact[] {
  const dir = join(root, ".github", "hooks");
  if (!existsSync(dir)) {
    return [];
  }
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch (err) {
    errors.push({
      path: dir,
      kind: "unreadable",
      detail: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
  const facts: HookFact[] = [];
  for (const name of names) {
    if (!name.endsWith(".json") || name.startsWith(".")) {
      continue;
    }
    const filePath = join(dir, name);
    const raw = readJsonConfig(filePath, errors);
    if (raw === undefined) {
      continue;
    }
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      errors.push({
        path: filePath,
        kind: "unexpected-shape",
        detail: "hook file is not a JSON object",
      });
      continue;
    }
    const hooks = (raw as Record<string, unknown>).hooks;
    if (hooks === undefined) {
      continue;
    }
    facts.push(
      ...hooksFromObject(hooks, filePath, "vscode-hooks", { project: root, own: dir }, errors, "vscode"),
    );
  }
  return facts;
}
