import { homedir } from "node:os";
import { basename, isAbsolute, join } from "node:path";

export type OsPlatform = "windows" | "linux" | "osx";

export type LaunchCommand = {
  executable: string;
  args: string[];
  platform?: OsPlatform;
  /** Working directory declared on the entry or an OS override. */
  cwd?: string;
};

export type CwdResolution =
  | { status: "absent" }
  | { status: "unresolved" }
  | { status: "foreign" }
  | { status: "ok"; abs: string };

/**
 * Placeholders the host expands at runtime. We cannot resolve these offline
 * without inventing a workspace, so path checks stay silent.
 */
const UNRESOLVED_CWD =
  /\$\{[^}]+\}|\$[A-Za-z_][A-Za-z0-9_]*|%[A-Za-z0-9_]+%/;

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

export function optionalCwd(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function cwdIsUnresolved(cwd: string): boolean {
  return UNRESOLVED_CWD.test(cwd);
}

/**
 * Windows drive (`C:\`, `D:/`) and UNC (`\\server\share`, `//server/share`)
 * paths. On POSIX these are not `path.isAbsolute`, so joining them onto the
 * project root invents a relative folder named `C:\…`.
 */
export function isWindowsAbsOrUnc(value: string): boolean {
  if (/^[A-Za-z]:/.test(value)) {
    return true;
  }
  if (value.startsWith("\\\\")) {
    return true;
  }
  return /^\/\/[^/]+\/[^/]/.test(value);
}

export function cwdSkipsExistenceCheck(resolution: CwdResolution): boolean {
  switch (resolution.status) {
    case "absent":
    case "ok":
      return false;
    case "unresolved":
    case "foreign":
      return true;
    default: {
      const _exhaustive: never = resolution;
      return _exhaustive;
    }
  }
}

/**
 * Resolve a declared cwd against the project root. Unresolved interpolations
 * and paths that belong to another OS are not guessed — callers must skip
 * existence checks.
 */
export function resolveLaunchCwd(
  cwd: string | undefined,
  projectRoot: string,
  hostPlatform: NodeJS.Platform = process.platform,
): CwdResolution {
  if (cwd === undefined) {
    return { status: "absent" };
  }
  if (cwdIsUnresolved(cwd)) {
    return { status: "unresolved" };
  }
  if (isWindowsAbsOrUnc(cwd)) {
    return hostPlatform === "win32" ? { status: "ok", abs: cwd } : { status: "foreign" };
  }
  let expanded = cwd;
  if (expanded.startsWith("~/")) {
    expanded = join(homedir(), expanded.slice(2));
  }
  const abs = isAbsolute(expanded) ? expanded : join(projectRoot, expanded);
  return { status: "ok", abs };
}

function withCwd(launch: LaunchCommand, cwd: string | undefined): LaunchCommand {
  return cwd === undefined ? launch : { ...launch, cwd };
}

export function launchFromCommandArgs(
  command: unknown,
  args?: unknown,
  platform?: OsPlatform,
  cwd?: string,
): LaunchCommand | undefined {
  const extra = stringArgs(args);
  if (typeof command === "string" && command.length > 0) {
    return withCwd(
      {
        executable: command,
        args: extra,
        ...(platform === undefined ? {} : { platform }),
      },
      cwd,
    );
  }
  if (
    Array.isArray(command) &&
    command.length > 0 &&
    typeof command[0] === "string" &&
    command[0].length > 0
  ) {
    const parts = command.filter((part): part is string => typeof part === "string");
    return withCwd(
      {
        executable: parts[0]!,
        args: [...parts.slice(1), ...extra],
        ...(platform === undefined ? {} : { platform }),
      },
      cwd,
    );
  }
  return undefined;
}

function launchFromOverride(
  value: unknown,
  platform: OsPlatform,
  base: LaunchCommand | undefined,
): LaunchCommand | undefined {
  if (typeof value === "string" && value.length > 0) {
    return launchFromCommandArgs(value, undefined, platform, base?.cwd);
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const cwd = optionalCwd(record.cwd) ?? base?.cwd;
    if (record.command !== undefined || record.args !== undefined) {
      const own = launchFromCommandArgs(record.command, record.args, platform, cwd);
      if (own !== undefined) {
        return own;
      }
    }
    if (base !== undefined) {
      return withCwd({ ...base, platform }, cwd);
    }
    return launchFromCommandArgs(record.command, record.args, platform, cwd);
  }
  return undefined;
}

/** Default launch plus each OS-specific override, kept as separate argv lists. */
export function launchesFromEntry(entry: Record<string, unknown>): LaunchCommand[] {
  const out: LaunchCommand[] = [];
  const baseCwd = optionalCwd(entry.cwd);
  const base = launchFromCommandArgs(entry.command, entry.args, undefined, baseCwd);
  if (base !== undefined) {
    out.push(base);
  }
  for (const os of OS_KEYS) {
    if (entry[os] === undefined) {
      continue;
    }
    const override = launchFromOverride(entry[os], os, base);
    if (override !== undefined) {
      out.push(override);
    }
  }
  return out;
}

export function formatLaunch(launch: LaunchCommand): string {
  return [launch.executable, ...launch.args].join(" ").trim();
}
