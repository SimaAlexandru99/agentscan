import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import type { ConfigErrorFact, HookFact } from "../facts/types";
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
    candidate.startsWith(".")
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
export function hooksFromObject(
  hooks: unknown,
  filePath: string,
  source: NonNullable<HookFact["source"]>,
  bases: HookBases,
  errors: ConfigErrorFact[],
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
    const malformed = !Array.isArray(groups) || groups.some((group) => {
      if (group === null || typeof group !== "object" || Array.isArray(group)) {
        return true;
      }
      const inner = (group as Record<string, unknown>).hooks;
      if (!Array.isArray(inner)) return true;
      return inner.some((entry) => {
        if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
          return true;
        }
        const item = entry as Record<string, unknown>;
        return (
          (item.command !== undefined &&
            (typeof item.command !== "string" || item.command.length === 0)) ||
          (item.type === "command" && typeof item.command !== "string")
        );
      });
    });
    if (malformed) {
      errors.push({ path: filePath, kind: "unexpected-shape", detail: `invalid hook groups for ${event}` });
      continue;
    }
    const commands = collectHookCommands(groups);
    if (commands.length === 0) {
      facts.push({ name: event, path: filePath, event, source });
      continue;
    }
    for (const command of commands) {
      const fact: HookFact = { name: event, path: filePath, event, source, command };
      const resolved = resolveHookScript(bases, command);
      if (resolved !== undefined) {
        fact.scriptPath = resolved.scriptPath;
        fact.scriptExists = resolved.exists;
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
      ...hooksFromObject(hooks, filePath, "settings", { project: root }, errors),
    );
  }
  return facts;
}

/** `hooks[event]` is an array of matcher groups, each with a `hooks` array. */
function collectHookCommands(groups: unknown): string[] {
  if (!Array.isArray(groups)) {
    return [];
  }
  const out: string[] = [];
  for (const group of groups) {
    if (group === null || typeof group !== "object" || Array.isArray(group)) {
      continue;
    }
    const inner = (group as Record<string, unknown>).hooks;
    if (!Array.isArray(inner)) {
      continue;
    }
    for (const entry of inner) {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
        continue;
      }
      const command = (entry as Record<string, unknown>).command;
      if (typeof command === "string" && command.length > 0) {
        out.push(command);
      }
    }
  }
  return out;
}
