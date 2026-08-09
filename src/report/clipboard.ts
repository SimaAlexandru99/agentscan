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
 * Absolute path to a tool, or null.
 *
 * PATH is read from the environment on every call rather than let Bun.which
 * consult its own copy, so the lookup and the spawn agree on one answer.
 */
function resolve(name: string): string | null {
  return Bun.which(name, { PATH: process.env.PATH ?? "" });
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
      const proc = Bun.spawn([bin, ...argv.slice(1)], {
        stdin: new TextEncoder().encode(text),
        stdout: "ignore",
        stderr: "ignore",
        // A clipboard tool that hangs must not hang the scan. wl-copy in
        // particular stays resident to serve the selection it just took.
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if ((await proc.exited) === 0) {
        return { ok: true, tool };
      }
      failures.push(tool);
    } catch {
      failures.push(tool);
    }
  }
  return { ok: false, reason: `clipboard tool failed: ${failures.join(", ")}` };
}
