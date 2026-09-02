import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import {
  COMMANDCODE_HOOK_HANDLER_TYPES,
  COMMANDCODE_HOOK_TIMEOUT_MAX,
  COMMANDCODE_HOOK_TIMEOUT_MIN,
  COMMANDCODE_PROJECT_DIR,
} from "../facts/commandcode";
import { GROK_HOOK_HANDLER_TYPES } from "../facts/grok";
import {
  claudeHandlerCompatible,
  copilotCanonicalEvent,
  inferHookSchemaProfile,
  isCopilotCliHooksDocument,
  type HookHandlerType,
  type HookSchemaProfile,
} from "../facts/hook-schema";
import type { Provider } from "../facts/provider";
import type { ConfigErrorFact, HookDefect, HookFact } from "../facts/types";
import {
  formatLaunch,
  launchFromCommandArgs,
  launchesFromEntry,
  resolveLaunchCwd,
  scriptCandidateFromLaunch,
  skipLaunchExistenceCheck,
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

const CLAUDE_HANDLER_TYPES = new Set(["command", "http", "mcp_tool", "mcp-tool", "prompt", "agent"]);
const COPILOT_HANDLER_TYPES = new Set(["command", "http", "prompt"]);

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
  if (PROJECT_DIR.test(extracted) || COMMANDCODE_PROJECT_DIR.test(extracted)) {
    const rel = extracted.replace(
      /^\$(?:CLAUDE_PROJECT_DIR|\{CLAUDE_PROJECT_DIR\}|COMMANDCODE_PROJECT_DIR|\{COMMANDCODE_PROJECT_DIR\}|COMMANDCODE_CWD|\{COMMANDCODE_CWD\})\/?/,
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

function nonemptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isHandlerEntry(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isMatcherOnlyGroup(group: Record<string, unknown>): boolean {
  return (
    group.matcher !== undefined &&
    group.type === undefined &&
    group.command === undefined &&
    group.url === undefined &&
    group.bash === undefined &&
    group.powershell === undefined &&
    group.exec === undefined
  );
}

/**
 * Claude and Command Code require nested `{ matcher?, hooks: [...] }` groups.
 * Official Claude examples are nested; the 2026-08-31 hooks page does not
 * document a flat handler array. VS Code and Copilot CLI use flat arrays.
 */
function handlersFromGroups(groups: unknown, nestedOnly: boolean): Record<string, unknown>[] {
  if (!Array.isArray(groups)) {
    return [];
  }
  const first = groups[0];
  if (
    !nestedOnly &&
    isHandlerEntry(first) &&
    (first.type !== undefined ||
      first.command !== undefined ||
      first.url !== undefined ||
      first.args !== undefined ||
      first.bash !== undefined ||
      first.powershell !== undefined ||
      first.exec !== undefined ||
      first.prompt !== undefined) &&
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

function normalizeHandlerType(type: string): HookHandlerType | undefined {
  if (type === "mcp-tool" || type === "mcp_tool") {
    return "mcp_tool";
  }
  if (type === "command" || type === "http" || type === "prompt" || type === "agent") {
    return type;
  }
  return undefined;
}

function unknownTypeLabel(item: Record<string, unknown>): string {
  if (!("type" in item) || item.type === undefined) {
    return "(missing)";
  }
  if (typeof item.type === "string") {
    return item.type;
  }
  return JSON.stringify(item.type);
}

function timeoutFromCommandcodeEntry(
  item: Record<string, unknown>,
): Pick<HookFact, "timeout" | "timeoutOutOfBounds"> {
  if (!("timeout" in item)) {
    return {};
  }
  const value = item.timeout;
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value < COMMANDCODE_HOOK_TIMEOUT_MIN || value > COMMANDCODE_HOOK_TIMEOUT_MAX) {
      return { timeout: value, timeoutOutOfBounds: true };
    }
    return { timeout: value };
  }
  return { timeoutOutOfBounds: true };
}

function timeoutFromCopilotEntry(item: Record<string, unknown>): Pick<HookFact, "timeout"> {
  const value = item.timeoutSec !== undefined ? item.timeoutSec : item.timeout;
  if (typeof value === "number" && Number.isFinite(value)) {
    return { timeout: value };
  }
  return {};
}

type HookContext = {
  event: string;
  filePath: string;
  source: NonNullable<HookFact["source"]>;
  sourceProvider: Provider;
  schemaProfile: HookSchemaProfile;
  bases: HookBases;
  hostPlatform: NodeJS.Platform;
};

function baseFact(
  ctx: HookContext,
  extra: Partial<HookFact> = {},
): HookFact {
  return {
    name: ctx.event,
    path: ctx.filePath,
    event: ctx.event,
    source: ctx.source,
    sourceProvider: ctx.sourceProvider,
    schemaProfile: ctx.schemaProfile,
    ...extra,
  };
}

function attachLaunch(
  fact: HookFact,
  launch: ReturnType<typeof launchFromCommandArgs>,
  ctx: HookContext,
  skipExists = false,
): HookFact {
  if (launch === undefined) {
    return fact;
  }
  const cwd = resolveLaunchCwd(launch.cwd, ctx.bases.project, ctx.hostPlatform);
  const candidate = scriptCandidateFromLaunch(launch, ctx.bases);
  if (
    skipExists ||
    candidate === undefined ||
    skipLaunchExistenceCheck(launch, cwd, candidate, ctx.hostPlatform)
  ) {
    return fact;
  }
  const resolved = resolveHookScript(
    ctx.bases,
    candidate,
    cwd.status === "ok" ? cwd.abs : undefined,
  );
  if (resolved === undefined) {
    return fact;
  }
  return { ...fact, scriptPath: resolved.scriptPath, scriptExists: resolved.exists };
}

function commandFactsFromLaunches(
  ctx: HookContext,
  item: Record<string, unknown>,
  defectIfEmpty: HookDefect,
): HookFact[] {
  const launches = launchesFromEntry(item);
  if (launches.length === 0) {
    return [baseFact(ctx, { handlerType: "command", defect: defectIfEmpty })];
  }
  return launches.map((launch) => {
    const command = formatLaunch(launch);
    const fact = baseFact(ctx, {
      handlerType: "command",
      command,
      ...(launch.platform === undefined ? {} : { platform: launch.platform }),
      ...(launch.cwd === undefined ? {} : { cwd: launch.cwd }),
    });
    return attachLaunch(fact, launch, ctx);
  });
}

function commandcodeHookFromEntry(item: Record<string, unknown>, ctx: HookContext): HookFact {
  const timeoutFacts = timeoutFromCommandcodeEntry(item);
  if (item.type !== "command") {
    return baseFact(ctx, {
      defect: "unknown-handler-type",
      unknownHandlerType: unknownTypeLabel(item),
      ...timeoutFacts,
    });
  }
  if (typeof item.command !== "string" || item.command.length === 0) {
    return baseFact(ctx, {
      handlerType: "command",
      defect: "command-without-command",
      ...timeoutFacts,
    });
  }
  const launch = launchFromCommandArgs(item.command);
  if (launch === undefined) {
    return baseFact(ctx, {
      handlerType: "command",
      defect: "command-without-command",
      ...timeoutFacts,
    });
  }
  const command = formatLaunch(launch);
  const fact = baseFact(ctx, {
    handlerType: "command",
    command,
    ...(launch.cwd === undefined ? {} : { cwd: launch.cwd }),
    ...timeoutFacts,
  });
  return attachLaunch(fact, launch, ctx);
}

function claudeHookFromEntry(item: Record<string, unknown>, ctx: HookContext): HookFact[] {
  const typeRaw = typeof item.type === "string" ? item.type : undefined;
  if (typeRaw === undefined) {
    return [
      baseFact(ctx, {
        defect: "unknown-handler-type",
        unknownHandlerType: "(missing)",
      }),
    ];
  }
  if (!CLAUDE_HANDLER_TYPES.has(typeRaw)) {
    return [
      baseFact(ctx, {
        defect: "unknown-handler-type",
        unknownHandlerType: typeRaw,
      }),
    ];
  }
  const handlerType = normalizeHandlerType(typeRaw);
  if (handlerType === undefined) {
    return [
      baseFact(ctx, {
        defect: "unknown-handler-type",
        unknownHandlerType: typeRaw,
      }),
    ];
  }
  if (!claudeHandlerCompatible(ctx.event, handlerType)) {
    return [baseFact(ctx, { handlerType, defect: "incompatible-handler" })];
  }
  if (handlerType === "http") {
    const url = nonemptyString(item.url);
    return [
      baseFact(ctx, {
        handlerType: "http",
        ...(url === undefined ? { defect: "http-without-url" as const } : {}),
      }),
    ];
  }
  if (handlerType === "mcp_tool") {
    const server = nonemptyString(item.server);
    const tool = nonemptyString(item.tool);
    return [
      baseFact(ctx, {
        handlerType: "mcp_tool",
        ...(server === undefined || tool === undefined
          ? { defect: "mcp-tool-without-server-or-tool" as const }
          : {}),
      }),
    ];
  }
  if (handlerType === "prompt" || handlerType === "agent") {
    const prompt = nonemptyString(item.prompt);
    return [
      baseFact(ctx, {
        handlerType,
        ...(prompt === undefined ? { defect: "prompt-without-prompt" as const } : {}),
      }),
    ];
  }
  return commandFactsFromLaunches(ctx, item, "command-without-command");
}

function vscodeNativeHookFromEntry(item: Record<string, unknown>, ctx: HookContext): HookFact[] {
  const typeRaw = typeof item.type === "string" ? item.type : undefined;
  if (typeRaw !== "command") {
    return [
      baseFact(ctx, {
        defect: "unknown-handler-type",
        unknownHandlerType: unknownTypeLabel(item),
      }),
    ];
  }
  return commandFactsFromLaunches(ctx, item, "command-without-command");
}

/**
 * Copilot CLI command handlers launch through one of `bash`, `powershell`, or
 * `command`, or through `exec` (an executable spawned without a shell, with
 * optional `args`). `exec` is documented as an alternative to the other three,
 * so an entry that carries only `exec` is complete. See docs/spec/copilot-hooks.md.
 */
function copilotCommandChoice(
  item: Record<string, unknown>,
  hostPlatform: NodeJS.Platform,
): { command: string; args?: unknown; skipExists: boolean } | undefined {
  const exec = nonemptyString(item.exec);
  if (exec !== undefined) {
    return { command: exec, args: item.args, skipExists: false };
  }
  const bash = nonemptyString(item.bash);
  const powershell = nonemptyString(item.powershell);
  const command = nonemptyString(item.command);
  if (hostPlatform === "win32") {
    if (powershell !== undefined) {
      return { command: powershell, skipExists: false };
    }
    if (command !== undefined) {
      return { command, skipExists: false };
    }
    if (bash !== undefined) {
      return { command: bash, skipExists: true };
    }
    return undefined;
  }
  if (bash !== undefined) {
    return { command: bash, skipExists: false };
  }
  if (command !== undefined) {
    return { command, skipExists: false };
  }
  if (powershell !== undefined) {
    return { command: powershell, skipExists: true };
  }
  return undefined;
}

function copilotHookFromEntry(item: Record<string, unknown>, ctx: HookContext): HookFact[] {
  const timeoutFacts = timeoutFromCopilotEntry(item);
  const typeRaw = typeof item.type === "string" ? item.type : undefined;
  const handlerType =
    typeRaw === undefined ? "command" : normalizeHandlerType(typeRaw);
  if (typeRaw !== undefined && (handlerType === undefined || !COPILOT_HANDLER_TYPES.has(typeRaw))) {
    return [
      baseFact(ctx, {
        defect: "unknown-handler-type",
        unknownHandlerType: typeRaw,
        ...timeoutFacts,
      }),
    ];
  }
  const type = handlerType ?? "command";
  const cwd = nonemptyString(item.cwd);
  if (type === "http") {
    const url = nonemptyString(item.url);
    return [
      baseFact(ctx, {
        handlerType: "http",
        ...(cwd === undefined ? {} : { cwd }),
        ...timeoutFacts,
        ...(url === undefined ? { defect: "http-without-url" as const } : {}),
      }),
    ];
  }
  if (type === "prompt") {
    const prompt = nonemptyString(item.prompt);
    const canonical = copilotCanonicalEvent(ctx.event);
    const defect: HookDefect | undefined =
      prompt === undefined
        ? "prompt-without-prompt"
        : canonical === "SessionStart"
          ? undefined
          : "incompatible-handler";
    return [
      baseFact(ctx, {
        handlerType: "prompt",
        ...(cwd === undefined ? {} : { cwd }),
        ...timeoutFacts,
        ...(defect === undefined ? {} : { defect }),
      }),
    ];
  }
  const choice = copilotCommandChoice(item, ctx.hostPlatform);
  if (choice === undefined) {
    return [
      baseFact(ctx, {
        handlerType: "command",
        ...(cwd === undefined ? {} : { cwd }),
        ...timeoutFacts,
        defect: "command-without-command",
      }),
    ];
  }
  const launch = launchFromCommandArgs(choice.command, choice.args, undefined, cwd);
  if (launch === undefined) {
    return [
      baseFact(ctx, {
        handlerType: "command",
        ...(cwd === undefined ? {} : { cwd }),
        ...timeoutFacts,
        defect: "command-without-command",
      }),
    ];
  }
  const fact = baseFact(ctx, {
    handlerType: "command",
    command: formatLaunch(launch),
    ...(launch.cwd === undefined ? {} : { cwd: launch.cwd }),
    ...timeoutFacts,
  });
  return [attachLaunch(fact, launch, ctx, choice.skipExists)];
}

function timeoutFromGrokEntry(item: Record<string, unknown>): Pick<HookFact, "timeout"> {
  if (!("timeout" in item)) {
    return {};
  }
  const value = item.timeout;
  if (typeof value === "number" && Number.isFinite(value)) {
    return { timeout: value };
  }
  return {};
}

function grokHookFromEntry(item: Record<string, unknown>, ctx: HookContext): HookFact[] {
  const timeoutFacts = timeoutFromGrokEntry(item);
  const typeRaw = typeof item.type === "string" ? item.type : undefined;
  if (typeRaw === undefined) {
    return [
      baseFact(ctx, {
        defect: "unknown-handler-type",
        unknownHandlerType: "(missing)",
        ...timeoutFacts,
      }),
    ];
  }
  if (!GROK_HOOK_HANDLER_TYPES.has(typeRaw)) {
    return [
      baseFact(ctx, {
        defect: "unknown-handler-type",
        unknownHandlerType: typeRaw,
        ...timeoutFacts,
      }),
    ];
  }
  if (typeRaw === "http") {
    const url = nonemptyString(item.url);
    return [
      baseFact(ctx, {
        handlerType: "http",
        ...timeoutFacts,
        ...(url === undefined ? { defect: "http-without-url" as const } : {}),
      }),
    ];
  }
  return commandFactsFromLaunches(ctx, item, "command-without-command").map((fact) => ({
    ...fact,
    ...timeoutFacts,
  }));
}

function hooksFromProfile(item: Record<string, unknown>, ctx: HookContext): HookFact[] {
  switch (ctx.schemaProfile) {
    case "claude":
      return claudeHookFromEntry(item, ctx);
    case "vscode-native":
      return vscodeNativeHookFromEntry(item, ctx);
    case "copilot-cli":
      return copilotHookFromEntry(item, ctx);
    case "commandcode":
      return [commandcodeHookFromEntry(item, ctx)];
    case "grok":
      return grokHookFromEntry(item, ctx);
    default: {
      const neverProfile: never = ctx.schemaProfile;
      return neverProfile;
    }
  }
}

/**
 * Turn one `hooks` object into facts, whatever file it came from.
 *
 * Schema profile selects the contract: Claude nested groups with a required
 * `type`, native VS Code command-only flat arrays, Copilot CLI `version: 1`,
 * or Command Code nested command handlers. See docs/spec/hook-events.md,
 * docs/spec/vscode-hooks.md, docs/spec/copilot-hooks.md,
 * docs/spec/commandcode-hooks.md.
 */
export function hooksFromObject(
  hooks: unknown,
  filePath: string,
  source: NonNullable<HookFact["source"]>,
  bases: HookBases,
  errors: ConfigErrorFact[],
  sourceProvider: Provider = "claude",
  hostPlatform: NodeJS.Platform = process.platform,
  schemaProfile?: HookSchemaProfile,
): HookFact[] {
  if (hooks === null || typeof hooks !== "object" || Array.isArray(hooks)) {
    errors.push({
      path: filePath,
      kind: "unexpected-shape",
      detail: "`hooks` is not an object",
    });
    return [];
  }

  const profile = inferHookSchemaProfile(sourceProvider, schemaProfile);
  const nestedOnly = profile === "claude" || profile === "commandcode" || profile === "grok";
  const facts: HookFact[] = [];
  for (const [event, groups] of Object.entries(hooks as Record<string, unknown>)) {
    if (!Array.isArray(groups)) {
      errors.push({
        path: filePath,
        kind: "unexpected-shape",
        detail: `invalid hook groups for ${event}`,
      });
      continue;
    }

    const ctx: HookContext = {
      event,
      filePath,
      source,
      sourceProvider,
      schemaProfile: profile,
      bases,
      hostPlatform,
    };

    let invalidGroup = false;
    for (const group of groups) {
      if (!isHandlerEntry(group)) {
        continue;
      }
      if (nestedOnly && group.matcher !== undefined && typeof group.matcher !== "string") {
        invalidGroup = true;
        facts.push(
          baseFact(ctx, {
            defect: "invalid-group",
            commandcodeInvalidMatcher: profile === "commandcode" ? true : undefined,
          }),
        );
      }
      const missingHooks = !Array.isArray(group.hooks);
      if ((isMatcherOnlyGroup(group) && missingHooks) || (nestedOnly && missingHooks)) {
        invalidGroup = true;
        facts.push(baseFact(ctx, { defect: "invalid-group" }));
        continue;
      }
      if (Array.isArray(group.hooks) && group.hooks.length === 0) {
        invalidGroup = true;
        facts.push(baseFact(ctx, { defect: "invalid-group" }));
      }
    }

    const handlers = handlersFromGroups(groups, nestedOnly);
    if (handlers.length === 0) {
      if (!invalidGroup) {
        facts.push(baseFact(ctx));
      }
      continue;
    }
    for (const item of handlers) {
      facts.push(...hooksFromProfile(item, ctx));
    }
  }
  return facts;
}

export function discoverHooks(root: string, errors: ConfigErrorFact[]): HookFact[] {
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
    facts.push(
      ...hooksFromObject(
        hooks,
        filePath,
        "settings",
        { project: root },
        errors,
        "claude",
        process.platform,
        "claude",
      ),
    );
  }
  return facts;
}

function discoverHookDir(
  dir: string,
  root: string,
  errors: ConfigErrorFact[],
  defaultProfile: HookSchemaProfile,
): HookFact[] {
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
    const doc = raw as Record<string, unknown>;
    const hooks = doc.hooks;
    if (hooks === undefined) {
      continue;
    }
    const profile = isCopilotCliHooksDocument(doc) ? "copilot-cli" : defaultProfile;
    facts.push(
      ...hooksFromObject(
        hooks,
        filePath,
        "vscode-hooks",
        { project: root, own: dir },
        errors,
        "vscode",
        process.platform,
        profile,
      ),
    );
  }
  return facts;
}

export function discoverVscodeHooks(root: string, errors: ConfigErrorFact[]): HookFact[] {
  return discoverHookDir(join(root, ".github", "hooks"), root, errors, "vscode-native");
}

/**
 * User hooks at `~/.copilot/hooks`. VS Code and Copilot CLI share this
 * directory. `version: 1` is Copilot CLI; otherwise native VS Code command-only.
 * Only read under `--global`. Policy files under `/etc/github-copilot/policy.d`
 * stay unread. See docs/spec/copilot-hooks.md and docs/spec/vscode-hooks.md.
 */
export function discoverCopilotUserHooks(errors: ConfigErrorFact[]): HookFact[] {
  const dir = join(homedir(), ".copilot", "hooks");
  return discoverHookDir(dir, dir, errors, "vscode-native");
}

/**
 * Grok native hooks. Never remaps `version: 1` to Copilot CLI.
 * See docs/spec/grok-hooks.md.
 */
export function discoverGrokHooks(
  dir: string,
  projectRoot: string,
  errors: ConfigErrorFact[],
): HookFact[] {
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
      ...hooksFromObject(
        hooks,
        filePath,
        "grok-hooks",
        { project: projectRoot, own: dir },
        errors,
        "grok",
        process.platform,
        "grok",
      ),
    );
  }
  return facts;
}
