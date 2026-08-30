import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import type { ConfigErrorFact, HookFact } from "../facts/types";
import type { Provider } from "../facts/provider";
import { readJsonConfig } from "./shared";

const INTERPRETERS = /^(?:bash|sh|zsh|python3?|node|bun|deno)$/;
/** Flags that mean "the next argument is source code, not a file". */
const INLINE_CODE_FLAGS = /^-(?:e|p|c)$/;
/** Anything that makes the command a shell program rather than one invocation. */
const SHELL_METACHARS = /[|;&`]|\$\(|\|\||&&/;

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
export function hookScriptPath(
  command: string,
  bases: { plugin?: string } = {},
): string | undefined {
  const trimmed = command.trim();
  if (trimmed.length === 0 || SHELL_METACHARS.test(trimmed)) {
    return undefined;
  }

  const tokens = trimmed.match(/"[^"]*"|'[^']*'|\S+/g);
  if (tokens === null || tokens.length === 0) {
    return undefined;
  }

  const unquote = (t: string): string =>
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
      ? t.slice(1, -1)
      : t;

  let i = 0;
  const first = unquote(tokens[0] as string);
  let interpreted = false;
  if (INTERPRETERS.test(first)) {
    interpreted = true;
    i = 1;
    while (i < tokens.length) {
      const flag = unquote(tokens[i] as string);
      if (!flag.startsWith("-")) {
        break;
      }
      // `node -e "<code>"` — the next token is source, never a path
      if (INLINE_CODE_FLAGS.test(flag)) {
        return undefined;
      }
      i += 1;
    }
  }

  const candidate = tokens[i] === undefined ? undefined : unquote(tokens[i] as string);
  if (candidate === undefined || (!candidate.includes("/") && !(interpreted && /\.(?:js|mjs|cjs|ts|py|sh|bash|zsh)$/i.test(candidate)))) {
    return undefined;
  }
  // A drive-letter path cannot be resolved here; do not guess.
  if (/^[A-Za-z]:[/\\]/.test(candidate)) {
    return undefined;
  }
  // Only the placeholders this source actually defines are expandable; every
  // other variable is unknowable, and so is CLAUDE_PLUGIN_ROOT outside a plugin.
  if (candidate.startsWith("$")) {
    if (PROJECT_DIR.test(candidate)) {
      return candidate;
    }
    return bases.plugin !== undefined && PLUGIN_ROOT.test(candidate)
      ? candidate
      : undefined;
  }
  if (
    candidate.startsWith("/") ||
    candidate.startsWith("./") ||
    candidate.startsWith("../") ||
    candidate.startsWith("~/") ||
    candidate.startsWith(".") ||
    (interpreted && /\.(?:js|mjs|cjs|ts|py|sh|bash|zsh)$/i.test(candidate))
  ) {
    return candidate;
  }
  return undefined;
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function resolveHookScript(
  bases: HookBases,
  raw: string,
): { scriptPath: string; exists: boolean } | undefined {
  const extracted = hookScriptPath(raw, bases);
  if (extracted === undefined) {
    return undefined;
  }
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
const HANDLER_TYPES = new Set(["command", "http", "mcp_tool", "prompt", "agent"]);

function handlerTypeOf(item: Record<string, unknown>): HookFact["handlerType"] {
  if (typeof item.type === "string" && HANDLER_TYPES.has(item.type)) {
    return item.type as NonNullable<HookFact["handlerType"]>;
  }
  if (item.command !== undefined) {
    return "command";
  }
  if (typeof item.url === "string") {
    return "http";
  }
  return undefined;
}

function commandValue(command: unknown): string | undefined {
  if (typeof command === "string" && command.length > 0) {
    return command;
  }
  if (Array.isArray(command) && command.length > 0 && typeof command[0] === "string" && command[0].length > 0) {
    return command.filter((part): part is string => typeof part === "string").join(" ");
  }
  return undefined;
}

function pathCandidate(command: unknown): string | undefined {
  if (typeof command === "string" && command.length > 0) {
    return command;
  }
  if (Array.isArray(command) && typeof command[0] === "string" && command[0].length > 0) {
    return command[0];
  }
  return undefined;
}

function isHandlerEntry(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function handlersFromGroups(groups: unknown): Record<string, unknown>[] {
  if (!Array.isArray(groups)) {
    return [];
  }
  const first = groups[0];
  if (isHandlerEntry(first) && (first.type !== undefined || first.command !== undefined || first.url !== undefined) && !Array.isArray(first.hooks)) {
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
    const handlers = handlersFromGroups(groups);
    if (handlers.length === 0) {
      facts.push({ name: event, path: filePath, event, source, sourceProvider });
      continue;
    }
    for (const item of handlers) {
      const handlerType = handlerTypeOf(item);
      const command = commandValue(item.command);
      const fact: HookFact = {
        name: event,
        path: filePath,
        event,
        source,
        sourceProvider,
        ...(handlerType === undefined ? {} : { handlerType }),
        ...(command === undefined ? {} : { command }),
      };
      if (handlerType === undefined || handlerType === "command") {
        // Prefer the full command string (joined argv) so `["node", "hook.js"]`
        // still path-checks the script token, not only argv[0].
        const candidate = command ?? pathCandidate(item.command);
        if (candidate !== undefined) {
          const resolved = resolveHookScript(bases, candidate);
          if (resolved !== undefined) {
            fact.scriptPath = resolved.scriptPath;
            fact.scriptExists = resolved.exists;
          }
        }
      }
      facts.push(fact);
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
