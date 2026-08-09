import { spawn } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";

/**
 * Copying the report to the system clipboard.
 *
 * This is the only part of agentscan that starts a subprocess, and it runs only
 * when `--copy` is passed. It writes to the clipboard and nowhere else — never
 * to disk, and never into the project being scanned. Saving and piping do not
 * need code: `agentscan check --output prompt > handoff.md` and
 * `agentscan check --json | jq` already work. The clipboard is the one thing a
 * shell cannot do portably, which is why it is the one thing built here.
 */

/** Ordered by preference; each entry is argv for a tool that reads stdin. */
const TOOLS: readonly (readonly string[])[] = [
  ["wl-copy"],
  // xclip and xsel write to the PRIMARY selection unless told otherwise, and
  // PRIMARY is not the clipboard a paste reads from.
  ["xclip", "-selection", "clipboard"],
  ["xsel", "--clipboard", "--input"],
  ["pbcopy"],
  // WSL: works with no display server at all, so it is the usual survivor here.
  // Last because it round-trips through Windows and rewrites line endings.
  ["clip.exe"],
];

const TIMEOUT_MS = 3000;

export type CopyResult =
  | { ok: true; tool: string }
  | { ok: false; reason: string };

/**
 * Every clipboard tool present on PATH, in preference order.
 *
 * All of them, not the best one: being installed does not mean being usable.
 * On a headless WSL shell `wl-copy` and `xclip` are both installed and both
 * exit 1 for want of a display while `clip.exe` succeeds, so the caller has to
 * try them in turn.
 */
export function clipboardCandidates(
  onPath: (name: string) => boolean = (name) => resolve(name) !== null,
): string[][] {
  return TOOLS.filter((t) => onPath(t[0] as string)).map((t) => [...t]);
}

/**
 * Absolute path to an executable on PATH, or null.
 *
 * Hand-rolled rather than `Bun.which`, so the same code runs under Node — the
 * published bundle targets Node so `npx` works without Bun installed, and this
 * file held the only two Bun-specific calls in the tool. PATH is read from the
 * environment on every call so the lookup and the spawn cannot disagree.
 *
 * POSIX semantics only: no PATHEXT probing. Every tool in the list above is
 * either a POSIX binary or `clip.exe`, which WSL resolves by its full name.
 */
function resolve(name: string): string | null {
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (dir.length === 0) {
      continue;
    }
    const candidate = join(dir, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // not here, or not executable — keep looking
    }
  }
  return null;
}

/** Try each installed tool until one exits 0. */
export async function copyToClipboard(text: string): Promise<CopyResult> {
  const candidates = clipboardCandidates();
  if (candidates.length === 0) {
    return {
      ok: false,
      reason: `no clipboard tool found (looked for ${TOOLS.map((t) => t[0]).join(", ")})`,
    };
  }

  const failures: string[] = [];
  for (const argv of candidates) {
    const tool = argv[0] as string;
    const bin = resolve(tool);
    if (bin === null) {
      continue;
    }
    try {
      const code = await runTool(bin, argv.slice(1), text);
      if (code === 0) {
        return { ok: true, tool };
      }
      failures.push(tool);
    } catch {
      failures.push(tool);
    }
  }
  return { ok: false, reason: `clipboard tool failed: ${failures.join(", ")}` };
}

/** Feed `text` to a tool's stdin; resolve its exit code, or null if it failed. */
function runTool(
  bin: string,
  args: string[],
  text: string,
): Promise<number | null> {
  return new Promise((resolveExit) => {
    // A clipboard tool that hangs must not hang the scan. wl-copy in particular
    // stays resident to serve the selection it just took.
    const child = spawn(bin, args, {
      stdio: ["pipe", "ignore", "ignore"],
      timeout: TIMEOUT_MS,
    });
    child.on("error", () => resolveExit(null));
    child.on("close", (code) => resolveExit(code));
    child.stdin?.on("error", () => {
      // A tool that exits before reading stdin gives EPIPE; `close` decides.
    });
    child.stdin?.end(text);
  });
}
