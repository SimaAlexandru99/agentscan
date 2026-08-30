import { basename } from "node:path";

export type OsPlatform = "windows" | "linux" | "osx";

export type LaunchCommand = {
  executable: string;
  args: string[];
  platform?: OsPlatform;
};

const INTERPRETERS = new Set([
  "bash",
  "sh",
  "zsh",
  "fish",
  "python",
  "python3",
  "python.exe",
  "node",
  "node.exe",
  "nodejs",
  "bun",
  "bun.exe",
  "deno",
  "deno.exe",
  "ruby",
  "perl",
  "php",
  "cmd",
  "cmd.exe",
  "powershell",
  "powershell.exe",
  "pwsh",
]);

const INLINE_CODE_FLAGS = /^-(?:e|p|c)$/;
const SHELL_METACHARS = /[|;&`]|\$\(|\|\||&&/;
const PROJECT_DIR = /^\$(?:CLAUDE_PROJECT_DIR\b|\{CLAUDE_PROJECT_DIR\})/;
const PLUGIN_ROOT = /^\$(?:CLAUDE_PLUGIN_ROOT\b|\{CLAUDE_PLUGIN_ROOT\})/;
const SCRIPT_EXT = /\.(?:js|mjs|cjs|ts|tsx|jsx|py|sh|bash|zsh|rb|pl|php|ps1|cmd|bat)$/i;
const OS_KEYS = ["windows", "linux", "osx"] as const;

function unquote(token: string): string {
  return (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
    ? token.slice(1, -1)
    : token;
}

function tokenize(command: string): string[] | undefined {
  const trimmed = command.trim();
  if (trimmed.length === 0 || SHELL_METACHARS.test(trimmed)) {
    return undefined;
  }
  const tokens = trimmed.match(/"[^"]*"|'[^']*'|\S+/g);
  if (tokens === null || tokens.length === 0) {
    return undefined;
  }
  return tokens.map(unquote);
}

function interpreterName(executable: string): string {
  return basename(executable).replace(/\.exe$/i, "").toLowerCase();
}

function isPathLike(candidate: string, interpreted: boolean): boolean {
  if (candidate.length === 0 || /^[A-Za-z]:[/\\]/.test(candidate)) {
    return false;
  }
  if (
    candidate.startsWith("/") ||
    candidate.startsWith("./") ||
    candidate.startsWith("../") ||
    candidate.startsWith("~/") ||
    candidate.startsWith(".") ||
    candidate.includes("/")
  ) {
    return true;
  }
  return interpreted && SCRIPT_EXT.test(candidate);
}

function expandPlaceholder(
  candidate: string,
  bases: { plugin?: string },
): string | undefined {
  if (!candidate.startsWith("$")) {
    return candidate;
  }
  if (PROJECT_DIR.test(candidate)) {
    return candidate;
  }
  return bases.plugin !== undefined && PLUGIN_ROOT.test(candidate)
    ? candidate
    : undefined;
}

/**
 * First filesystem operand of a launch argv. Undefined when the answer is not
 * certain — PATH binaries, `node -e`, and shell compounds are skipped.
 */
export function scriptCandidateFromArgv(
  argv: string[],
  bases: { plugin?: string } = {},
): string | undefined {
  if (argv.length === 0) {
    return undefined;
  }
  if (argv.some((part) => SHELL_METACHARS.test(part))) {
    return undefined;
  }

  let i = 0;
  const first = argv[0]!;
  const interpreted = INTERPRETERS.has(interpreterName(first));
  if (interpreted) {
    i = 1;
    while (i < argv.length) {
      const flag = argv[i]!;
      if (!flag.startsWith("-")) {
        break;
      }
      if (INLINE_CODE_FLAGS.test(flag)) {
        return undefined;
      }
      i += 1;
    }
  }

  const candidate = argv[i];
  if (candidate === undefined || !isPathLike(candidate, interpreted)) {
    return undefined;
  }
  return expandPlaceholder(candidate, bases);
}

export function scriptCandidateFromLaunch(
  launch: LaunchCommand,
  bases: { plugin?: string } = {},
): string | undefined {
  if (launch.args.length === 0 && /\s/.test(launch.executable)) {
    const tokens = tokenize(launch.executable);
    return tokens === undefined ? undefined : scriptCandidateFromArgv(tokens, bases);
  }
  return scriptCandidateFromArgv([launch.executable, ...launch.args], bases);
}

/**
 * Pull the script path out of a hook command string. Same conservatism as
 * before: shell programs are skipped outright.
 */
export function hookScriptPath(
  command: string,
  bases: { plugin?: string } = {},
): string | undefined {
  const tokens = tokenize(command);
  return tokens === undefined ? undefined : scriptCandidateFromArgv(tokens, bases);
}

function stringArgs(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((part): part is string => typeof part === "string");
}

export function launchFromCommandArgs(
  command: unknown,
  args?: unknown,
  platform?: OsPlatform,
): LaunchCommand | undefined {
  const extra = stringArgs(args);
  if (typeof command === "string" && command.length > 0) {
    return {
      executable: command,
      args: extra,
      ...(platform === undefined ? {} : { platform }),
    };
  }
  if (
    Array.isArray(command) &&
    command.length > 0 &&
    typeof command[0] === "string" &&
    command[0].length > 0
  ) {
    const parts = command.filter((part): part is string => typeof part === "string");
    return {
      executable: parts[0]!,
      args: [...parts.slice(1), ...extra],
      ...(platform === undefined ? {} : { platform }),
    };
  }
  return undefined;
}

function launchFromOverride(value: unknown, platform: OsPlatform): LaunchCommand | undefined {
  if (typeof value === "string" && value.length > 0) {
    return launchFromCommandArgs(value, undefined, platform);
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    return launchFromCommandArgs(record.command, record.args, platform);
  }
  return undefined;
}

/** Default launch plus each OS-specific override, kept as separate argv lists. */
export function launchesFromEntry(entry: Record<string, unknown>): LaunchCommand[] {
  const out: LaunchCommand[] = [];
  const base = launchFromCommandArgs(entry.command, entry.args);
  if (base !== undefined) {
    out.push(base);
  }
  for (const os of OS_KEYS) {
    if (entry[os] === undefined) {
      continue;
    }
    const override = launchFromOverride(entry[os], os);
    if (override !== undefined) {
      out.push(override);
    }
  }
  return out;
}

export function formatLaunch(launch: LaunchCommand): string {
  return [launch.executable, ...launch.args].join(" ").trim();
}
