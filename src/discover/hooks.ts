import { dirname, join } from "node:path";
import {
  CODEX_SHORT_TIMEOUT_EVENTS,
  CODEX_SHORT_TIMEOUT_MAX,
  CODEX_SHORT_TIMEOUT_MIN,
} from "../facts/codex";
import { DEVIN_HOOK_HANDLER_TYPES } from "../facts/devin";
import { providerHome } from "../facts/providers";
import { GEMINI_HOOK_HANDLER_TYPES } from "../facts/gemini";
import { GROK_HOOK_HANDLER_TYPES } from "../facts/grok";
import { QWEN_HOOK_HANDLER_TYPES } from "../facts/qwen";
import {
  HOOK_PROFILES,
  PROFILES,
  type EventKeyedProfile,
  type FlatHookProfile,
  type HookSchemaProfile,
  type PipedProfile,
} from "../facts/hook-profiles";
import {
  claudeHandlerCompatible,
  COPILOT_HANDLER_TYPES,
  copilotCanonicalEvent,
  isCopilotCliHooksDocument,
  type HookHandlerType,
} from "../facts/hook-schema";
import type { Provider } from "../facts/provider";
import type { HookDefect, HookFact } from "../facts/types";
import {
  checkCommandScript,
  checkLaunchScript,
  formatLaunch,
  launchFromCommandArgs,
  launchesFromEntry,
  type ScriptBases,
  withScriptCheck,
} from "./launch";
import { isRecord, listDir, readConfigFile, reportRootShapeOnce, type ScanIO } from "./fs";

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
export type HookBases = ScriptBases;

function nonemptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
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
    isRecord(first) &&
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
    return groups.filter(isRecord);
  }
  const out: Record<string, unknown>[] = [];
  for (const group of groups) {
    if (!isRecord(group)) {
      continue;
    }
    const inner = group.hooks;
    if (!Array.isArray(inner)) {
      continue;
    }
    for (const entry of inner) {
      if (isRecord(entry)) {
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

/** Timeout facts for profiles whose spec documents a closed range. */
function timeoutFromEntry(
  item: Record<string, unknown>,
  profile: HookSchemaProfile,
): Pick<HookFact, "timeout" | "timeoutOutOfBounds"> {
  const range = HOOK_PROFILES[profile].timeout;
  if (range === undefined || !("timeout" in item)) {
    return {};
  }
  const value = item.timeout;
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value < range.min || value > range.max) {
      return { timeout: value, timeoutOutOfBounds: true };
    }
    return { timeout: value };
  }
  return { timeoutOutOfBounds: true };
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
  return withScriptCheck(fact, skipExists ? undefined : checkLaunchScript(launch, ctx.bases, ctx.hostPlatform));
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
  const timeoutFacts = timeoutFromEntry(item, ctx.schemaProfile);
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
  const typeRaw = typeof item.type === "string" ? item.type : undefined;
  const handlerType =
    typeRaw === undefined ? "command" : normalizeHandlerType(typeRaw);
  if (typeRaw !== undefined && (handlerType === undefined || !COPILOT_HANDLER_TYPES.has(typeRaw))) {
    return [
      baseFact(ctx, {
        defect: "unknown-handler-type",
        unknownHandlerType: typeRaw,
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
        defect: "command-without-command",
      }),
    ];
  }
  const fact = baseFact(ctx, {
    handlerType: "command",
    command: formatLaunch(launch),
    ...(launch.cwd === undefined ? {} : { cwd: launch.cwd }),
  });
  return [attachLaunch(fact, launch, ctx, choice.skipExists)];
}


function grokHookFromEntry(item: Record<string, unknown>, ctx: HookContext): HookFact[] {
  const typeRaw = typeof item.type === "string" ? item.type : undefined;
  if (typeRaw === undefined) {
    return [
      baseFact(ctx, {
        defect: "unknown-handler-type",
        unknownHandlerType: "(missing)",
      }),
    ];
  }
  if (!GROK_HOOK_HANDLER_TYPES.has(typeRaw)) {
    return [
      baseFact(ctx, {
        defect: "unknown-handler-type",
        unknownHandlerType: typeRaw,
      }),
    ];
  }
  if (typeRaw === "http") {
    const url = nonemptyString(item.url);
    return [
      baseFact(ctx, {
        handlerType: "http",
        ...(url === undefined ? { defect: "http-without-url" as const } : {}),
      }),
    ];
  }
  return commandFactsFromLaunches(ctx, item, "command-without-command");
}

/**
 * Gemini nests groups like Claude but accepts one handler type. `timeout` is
 * milliseconds here against the seconds `HookFact.timeout` documents, and no
 * check reads it, so it is deliberately not recorded rather than recorded in
 * the wrong unit. See docs/spec/gemini-hooks.md.
 */
function geminiHookFromEntry(item: Record<string, unknown>, ctx: HookContext): HookFact[] {
  const typeRaw = typeof item.type === "string" ? item.type : undefined;
  if (typeRaw === undefined || !GEMINI_HOOK_HANDLER_TYPES.has(typeRaw)) {
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
 * SessionEnd and Interrupt are the only events with a quoted timeout range
 * (1–3 seconds). A finite timeout on any other event is recorded and not
 * flagged: the page quotes a 600 second default and no maximum.
 */
function codexTimeoutFacts(
  item: Record<string, unknown>,
  event: string,
): Pick<HookFact, "timeout" | "timeoutOutOfBounds"> {
  if (!("timeout" in item)) {
    return {};
  }
  const value = item.timeout;
  const short = CODEX_SHORT_TIMEOUT_EVENTS.has(event);
  if (typeof value === "number" && Number.isFinite(value)) {
    if (short && (value < CODEX_SHORT_TIMEOUT_MIN || value > CODEX_SHORT_TIMEOUT_MAX)) {
      return { timeout: value, timeoutOutOfBounds: true };
    }
    return { timeout: value };
  }
  return short ? { timeoutOutOfBounds: true } : {};
}

/**
 * Codex nests groups like Claude. `command` and `mcp_tool` run. `prompt` and
 * `agent` are parsed but skipped. A missing `type` is not command. `SessionEnd`
 * does not run `mcp_tool`. See docs/spec/codex-hooks.md.
 */
function codexHookFromEntry(item: Record<string, unknown>, ctx: HookContext): HookFact[] {
  const timeoutFacts = codexTimeoutFacts(item, ctx.event);
  const typeRaw = typeof item.type === "string" ? item.type : undefined;
  if (typeRaw === "prompt" || typeRaw === "agent") {
    return [baseFact(ctx, { handlerType: typeRaw, defect: "incompatible-handler", ...timeoutFacts })];
  }
  if (typeRaw === "mcp_tool") {
    if (ctx.event === "SessionEnd") {
      return [baseFact(ctx, { handlerType: "mcp_tool", defect: "incompatible-handler", ...timeoutFacts })];
    }
    const server = nonemptyString(item.server);
    const tool = nonemptyString(item.tool);
    return [
      baseFact(ctx, {
        handlerType: "mcp_tool",
        ...(server === undefined || tool === undefined
          ? { defect: "mcp-tool-without-server-or-tool" as const }
          : {}),
        ...timeoutFacts,
      }),
    ];
  }
  if (typeRaw !== "command") {
    return [
      baseFact(ctx, {
        defect: "unknown-handler-type",
        unknownHandlerType: unknownTypeLabel(item),
        ...timeoutFacts,
      }),
    ];
  }
  return [{ ...commandHook(baseFact(ctx), nonemptyString(item.command), ctx.bases.project), ...timeoutFacts }];
}

/**
 * Devin CLI nests groups like Claude. `type` is `command` or `prompt`.
 * `timeout` has no quoted range, so it is not recorded. See docs/spec/devin-hooks.md.
 */
function devinHookFromEntry(item: Record<string, unknown>, ctx: HookContext): HookFact[] {
  const typeRaw = typeof item.type === "string" ? item.type : undefined;
  if (typeRaw === undefined || !DEVIN_HOOK_HANDLER_TYPES.has(typeRaw)) {
    return [
      baseFact(ctx, {
        defect: "unknown-handler-type",
        unknownHandlerType: unknownTypeLabel(item),
      }),
    ];
  }
  if (typeRaw === "prompt") {
    const prompt = nonemptyString(item.prompt);
    return [
      baseFact(ctx, {
        handlerType: "prompt",
        ...(prompt === undefined ? { defect: "prompt-without-prompt" as const } : {}),
      }),
    ];
  }
  return [commandHook(baseFact(ctx), nonemptyString(item.command), ctx.bases.project)];
}

/**
 * Qwen Code: `command` needs `command`, `http` needs `url`. `prompt` and the
 * internal `function` are accepted as written. See docs/spec/qwen-hooks.md.
 */
function qwenHookFromEntry(item: Record<string, unknown>, ctx: HookContext): HookFact[] {
  const typeRaw = typeof item.type === "string" ? item.type : undefined;
  if (typeRaw === undefined || !QWEN_HOOK_HANDLER_TYPES.has(typeRaw)) {
    return [baseFact(ctx, { defect: "unknown-handler-type", unknownHandlerType: unknownTypeLabel(item) })];
  }
  if (typeRaw === "http") {
    return [
      baseFact(ctx, {
        handlerType: "http",
        ...(nonemptyString(item.url) === undefined ? { defect: "http-without-url" as const } : {}),
      }),
    ];
  }
  if (typeRaw === "prompt") {
    return [baseFact(ctx, { handlerType: "prompt" })];
  }
  if (typeRaw === "function") {
    return [baseFact(ctx)];
  }
  return commandFactsFromLaunches(ctx, item, "command-without-command");
}

/** One handler entry -> facts, for profiles whose layout is `nested` or `flat-array`. */
const ENTRY_READERS: Record<PipedProfile, (item: Record<string, unknown>, ctx: HookContext) => HookFact[]> = {
  claude: claudeHookFromEntry,
  "vscode-native": vscodeNativeHookFromEntry,
  "copilot-cli": copilotHookFromEntry,
  commandcode: (item, ctx) => [commandcodeHookFromEntry(item, ctx)],
  grok: grokHookFromEntry,
  gemini: geminiHookFromEntry,
  devin: devinHookFromEntry,
  codex: codexHookFromEntry,
  qwen: qwenHookFromEntry,
};

function isPipedProfile(profile: HookSchemaProfile): profile is PipedProfile {
  const layout = HOOK_PROFILES[profile].layout;
  return layout === "nested" || layout === "flat-array";
}

/** String command, else `command-without-command`, else a script-existence check. */
export function commandHook(
  base: HookFact,
  command: string | undefined,
  projectRoot: string,
): HookFact {
  if (command === undefined || command.length === 0) {
    return { ...base, handlerType: "command", defect: "command-without-command" };
  }
  return withScriptCheck(
    { ...base, handlerType: "command", command },
    checkCommandScript(command, { project: projectRoot }),
  );
}

/** Records the one `unexpected-shape` error when a `hooks` value is not an object. */
export function isHooksObject(
  hooks: unknown,
  filePath: string,
  io: ScanIO,
): hooks is Record<string, unknown> {
  if (isRecord(hooks)) {
    return true;
  }
  io.errors.push({ path: filePath, kind: "unexpected-shape", detail: "`hooks` is not an object" });
  return false;
}

/** A hook file's root object; a missing file is no hooks, not an error. */
export function readHooksDocument(filePath: string, io: ScanIO): Record<string, unknown> | undefined {
  const raw = readConfigFile(filePath, io, { optional: true });
  if (raw === undefined) {
    return undefined;
  }
  if (!isRecord(raw)) {
    reportRootShapeOnce(filePath, io, "file is not a JSON object");
    return undefined;
  }
  return raw as Record<string, unknown>;
}

/** How one hook-bearing file is read: its source, provider, and schema profile. */
type HooksFileSpec = {
  source: NonNullable<HookFact["source"]>;
  sourceProvider: Provider;
  /** Fixed profile, or chosen from the parsed document. */
  profile: HookSchemaProfile | ((doc: Record<string, unknown>) => HookSchemaProfile);
};

/** The one "exists -> read -> object -> `.hooks` -> facts" path for nested hook files. */
export function readHooksFile(
  filePath: string,
  spec: HooksFileSpec,
  bases: HookBases,
  io: ScanIO,
): HookFact[] {
  const doc = readHooksDocument(filePath, io);
  if (doc === undefined || doc.hooks === undefined) {
    return [];
  }
  const profile = typeof spec.profile === "function" ? spec.profile(doc) : spec.profile;
  return hooksFromObject(
    doc.hooks,
    filePath,
    spec.source,
    bases,
    io,
    { sourceProvider: spec.sourceProvider, schemaProfile: profile },
  );
}

/** Fact factory for one flat-document profile; source and provider are the profile's own. */
export function hookBase(profile: FlatHookProfile) {
  return (event: string, path: string, extra: Partial<HookFact> = {}): HookFact => ({
    path,
    event,
    source: PROFILES[profile].fileSource,
    sourceProvider: profile,
    schemaProfile: profile,
    ...extra,
  });
}

/**
 * The event-keyed flat documents (`{ hooks: { Event: [entry, ...] } }`) of
 * Cursor and Windsurf: one fact per entry, built by `entry` from `base`.
 * Never routed through `hooksFromObject`, whose groups are Claude's nested shape.
 */
export function readFlatHooks(
  filePath: string,
  profile: EventKeyedProfile,
  io: ScanIO,
  entry: (
    item: unknown,
    base: (extra?: Partial<HookFact>) => HookFact,
    hostPlatform: NodeJS.Platform,
  ) => HookFact,
  hostPlatform: NodeJS.Platform = process.platform,
): HookFact[] {
  const hooks = readHooksDocument(filePath, io)?.hooks;
  if (hooks === undefined || !isHooksObject(hooks, filePath, io)) {
    return [];
  }
  const make = hookBase(profile);
  const facts: HookFact[] = [];
  for (const [event, value] of Object.entries(hooks)) {
    if (!Array.isArray(value)) {
      io.errors.push({
        path: filePath,
        kind: "unexpected-shape",
        detail: `${event} hook list is not an array`,
      });
      continue;
    }
    for (const item of value) {
      facts.push(entry(item, (extra) => make(event, filePath, extra), hostPlatform));
    }
  }
  return facts;
}

export function hookJsonFiles(dir: string, io: ScanIO): string[] {
  return (listDir(dir, io, { optional: true }) ?? [])
    .map(({ name }) => name)
    .filter((name) => name.endsWith(".json") && !name.startsWith("."))
    .map((name) => join(dir, name));
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
  io: ScanIO,
  owner: { sourceProvider: Provider; schemaProfile: HookSchemaProfile },
  hostPlatform: NodeJS.Platform = process.platform,
): HookFact[] {
  if (!isHooksObject(hooks, filePath, io)) {
    return [];
  }

  const { sourceProvider, schemaProfile: profile } = owner;
  const nestedOnly = HOOK_PROFILES[profile].layout === "nested";
  const facts: HookFact[] = [];
  for (const [event, groups] of Object.entries(hooks as Record<string, unknown>)) {
    if (!Array.isArray(groups)) {
      io.errors.push({
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
      if (!isRecord(group)) {
        continue;
      }
      if (nestedOnly && group.matcher !== undefined && typeof group.matcher !== "string") {
        invalidGroup = true;
        facts.push(
          baseFact(ctx, {
            defect: "invalid-group",
            defectDetail: "matcher-not-string",
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
    if (!isPipedProfile(profile)) {
      continue;
    }
    for (const item of handlers) {
      facts.push(...ENTRY_READERS[profile](item, ctx));
    }
  }
  return facts;
}

function claudeSettingsHooksFromFile(
  filePath: string,
  projectRoot: string,
  io: ScanIO,
): HookFact[] {
  return readHooksFile(
    filePath,
    { source: "settings", sourceProvider: "claude", profile: "claude" },
    { project: projectRoot },
    io,
  );
}

export function discoverHooks(root: string, io: ScanIO): HookFact[] {
  return [
    ...claudeSettingsHooksFromFile(join(root, ".claude", "settings.json"), root, io),
    ...claudeSettingsHooksFromFile(join(root, ".claude", "settings.local.json"), root, io),
  ];
}

/**
 * Project `.gemini/settings.json` — the same file the MCP scan opens, read for
 * its `hooks` object. User `~/.gemini/settings.json` is opened under `--global`
 * together with that file's MCP servers. See docs/spec/gemini-hooks.md.
 */
export function discoverGeminiHooks(root: string, io: ScanIO): HookFact[] {
  return discoverGeminiHooksFile(join(root, ".gemini", "settings.json"), root, io);
}

/**
 * Gemini `settings.json` hooks. `filePath` may be the project file or the
 * `--global` user file; relative scripts resolve against `projectRoot`.
 * See docs/spec/gemini-hooks.md.
 */
function discoverGeminiHooksFile(
  filePath: string,
  projectRoot: string,
  io: ScanIO,
): HookFact[] {
  return readHooksFile(
    filePath,
    {
      source: "gemini-settings",
      sourceProvider: "gemini",
      profile: "gemini",
    },
    { project: projectRoot },
    io,
  );
}

/**
 * User `~/.gemini/settings.json` hooks. Only called under `--global`.
 * Opened together with user MCP so one surface is not attributed without the other.
 */
export function discoverGeminiUserHooks(
  projectRoot: string,
  io: ScanIO,
): HookFact[] {
  return discoverGeminiHooksFile(join(providerHome("gemini"), "settings.json"), projectRoot, io);
}

/**
 * User `~/.claude/settings.json`. Only called under `--global`.
 * `${CLAUDE_PROJECT_DIR}` and bare relative paths resolve against the scanned
 * project root, not home. See docs/spec/hook-sources.md.
 */
export function discoverClaudeUserHooks(
  projectRoot: string,
  io: ScanIO,
): HookFact[] {
  return claudeSettingsHooksFromFile(
    join(providerHome("claude"), "settings.json"),
    projectRoot,
    io,
  );
}

function discoverHookDir(
  dir: string,
  root: string,
  io: ScanIO,
): HookFact[] {
  return hookJsonFiles(dir, io).flatMap((filePath) =>
    readHooksFile(
      filePath,
      {
        source: "vscode-hooks",
        sourceProvider: "vscode",
        profile: (doc) => (isCopilotCliHooksDocument(doc) ? "copilot-cli" : "vscode-native"),
      },
      { project: root, own: dir },
      io,
    ),
  );
}

export function discoverVscodeHooks(root: string, io: ScanIO): HookFact[] {
  return discoverHookDir(join(root, ".github", "hooks"), root, io);
}

/**
 * User hooks at `$COPILOT_HOME/hooks` or `~/.copilot/hooks`. VS Code and
 * Copilot CLI share this directory. `version: 1` is Copilot CLI; otherwise
 * native VS Code command-only. Only read under `--global`. Policy files
 * under `/etc/github-copilot/policy.d` stay unread.
 * See docs/spec/copilot-hooks.md and docs/spec/vscode-hooks.md.
 */
export function discoverCopilotUserHooks(io: ScanIO): HookFact[] {
  const dir = join(providerHome("copilot"), "hooks");
  return discoverHookDir(dir, dir, io);
}

function copilotSettingsHooksFromFiles(
  files: string[],
  projectRoot: string,
  io: ScanIO,
): HookFact[] {
  return files.flatMap((filePath) =>
    readHooksFile(
      filePath,
      {
        source: "copilot-settings",
        sourceProvider: "vscode",
        profile: "copilot-cli",
      },
      { project: projectRoot, own: dirname(filePath) },
      io,
    ),
  );
}

/**
 * Inline Copilot CLI `hooks` in project settings. Always `copilot-cli` —
 * these files are Copilot CLI config, not native VS Code hook documents, so
 * they do not need `version: 1`. `.claude/settings.json` stays on the Claude
 * profile. See docs/spec/copilot-hooks.md.
 */
export function discoverCopilotSettingsHooks(
  root: string,
  io: ScanIO,
): HookFact[] {
  return copilotSettingsHooksFromFiles(
    [
      join(root, ".github", "copilot", "settings.json"),
      join(root, ".github", "copilot", "settings.local.json"),
    ],
    root,
    io,
  );
}

/**
 * Inline Copilot CLI `hooks` in `$COPILOT_HOME/settings.json` or
 * `~/.copilot/settings.json`. Only read under `--global`.
 */
export function discoverCopilotUserSettingsHooks(io: ScanIO): HookFact[] {
  const home = providerHome("copilot");
  return copilotSettingsHooksFromFiles([join(home, "settings.json")], home, io);
}

/**
 * Grok native hooks. Never remaps `version: 1` to Copilot CLI.
 * See docs/spec/grok-hooks.md.
 */
export function discoverGrokHooks(
  dir: string,
  projectRoot: string,
  io: ScanIO,
): HookFact[] {
  return hookJsonFiles(dir, io).flatMap((filePath) =>
    readHooksFile(
      filePath,
      { source: "grok-hooks", sourceProvider: "grok", profile: "grok" },
      { project: projectRoot, own: dir },
      io,
    ),
  );
}

/**
 * Qwen Code `settings.json` hooks: project `.qwen/settings.json`, or the user
 * file under `--global`. Relative scripts resolve against `projectRoot`.
 * See docs/spec/qwen-hooks.md.
 */
export function discoverQwenHooksFile(filePath: string, projectRoot: string, io: ScanIO): HookFact[] {
  return readHooksFile(
    filePath,
    { source: "qwen-settings", sourceProvider: "qwen", profile: "qwen" },
    { project: projectRoot },
    io,
  );
}
