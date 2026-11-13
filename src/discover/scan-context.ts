import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { AGENT_CONFIG_DOT_DIRS } from "../facts/providers";

/**
 * Where a scan runs: root resolution from the start directory, the walk-up
 * between start and boundary, and the hop maths both use.
 */

/**
 * Paths that mean "this directory has agent config worth scanning", matching
 * what discovery already looks for. A tree with only `.claude/` and no
 * `package.json` is a real project for this tool.
 */
const AGENT_CONFIG_SIGNALS = [
  ...AGENT_CONFIG_DOT_DIRS,
  ".mcp.json",
  "mcp.json",
  "AGENTS.md",
  "CLAUDE.md",
  "skills-lock.json",
  "opencode.json",
  "opencode.jsonc",
];

const WORKSPACE_MARKERS = [
  "package.json",
  "pnpm-workspace.yaml",
  "lerna.json",
  "go.work",
  "Cargo.toml",
  "pyproject.toml",
] as const;

export function hasAgentConfigSignal(dir: string): boolean {
  return AGENT_CONFIG_SIGNALS.some((name) => existsSync(join(dir, name)));
}

function hasWorkspaceMarker(dir: string): boolean {
  return WORKSPACE_MARKERS.some((name) => existsSync(join(dir, name)));
}

/** Optional pin that stops walk-up before a parent Git root (fixtures, nested checkouts). */
export const SCAN_ROOT_MARKER = ".agentscan-root";

export type ScanLocation = {
  startDir: string;
  workspaceBoundary: string | undefined;
  repositoryBoundary: string | undefined;
  /** Farthest ancestor the scan may walk. Child provider dirs do not shrink this. */
  scanBoundary: string;
  /** Display / package root. A nearer provider signal may win over a parent package.json. */
  root: string;
};

/** Everything a scan needs to know before it reads a file. Global scope is config, not location. */
export type ScanContext = Pick<ScanLocation, "root" | "startDir" | "scanBoundary">;

/**
 * Walk up from startDir. Prefer the nearest provider-config directory, then
 * the nearest workspace/package root, then the nearest Git root. A child
 * `.cursor` or `.claude` therefore wins as `projectRoot` over a parent
 * `package.json`, but `scanBoundary` stays at Git/workspace so parent Claude
 * or Codex files remain visible.
 */
export function resolveScanContext(
  startDir: string,
  opts: { allowNoProject?: boolean } = {},
): ScanLocation {
  const requestedDir = resolve(startDir);
  let dir = requestedDir;
  let nearestSignal: string | undefined;
  let nearestWorkspace: string | undefined;
  let nearestGit: string | undefined;
  let nearestPin: string | undefined;
  for (;;) {
    if (nearestPin === undefined && existsSync(join(dir, SCAN_ROOT_MARKER))) {
      nearestPin = dir;
    }
    if (nearestSignal === undefined && hasAgentConfigSignal(dir)) {
      nearestSignal = dir;
    }
    if (nearestWorkspace === undefined && hasWorkspaceMarker(dir)) {
      nearestWorkspace = dir;
    }
    if (nearestGit === undefined && existsSync(join(dir, ".git"))) {
      nearestGit = dir;
    }
    if (nearestPin !== undefined) {
      break;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  // Prefer whichever of signal/workspace is closer to startDir. A fixture
  // with only package.json must not jump to a parent repo's `.claude`.
  const projectRoot = nearer(requestedDir, nearestSignal, nearestWorkspace) ?? nearestGit;
  if (projectRoot === undefined && opts.allowNoProject === true) {
    // `--global` with no project: scan the global locations from here.
    // shortcut: nested discovery still walks this dir's subtree (depth-capped);
    // thread a global-only flag through discovery if that ever costs too much.
    return {
      startDir: requestedDir,
      workspaceBoundary: undefined,
      repositoryBoundary: undefined,
      scanBoundary: requestedDir,
      root: requestedDir,
    };
  }
  if (projectRoot === undefined) {
    throw new Error(
      `No package.json or agent configuration found walking up from ${requestedDir}`,
    );
  }
  const scanBoundary = nearestPin ?? nearestGit ?? nearestWorkspace ?? nearestSignal ?? requestedDir;
  return {
    startDir: requestedDir,
    workspaceBoundary: nearestWorkspace,
    repositoryBoundary: nearestGit,
    scanBoundary,
    root: projectRoot,
  };
}

export function resolveRoot(startDir: string): string {
  return resolveScanContext(startDir).root;
}

function nearer(
  startDir: string,
  a: string | undefined,
  b: string | undefined,
): string | undefined {
  if (a === undefined) {
    return b;
  }
  if (b === undefined) {
    return a;
  }
  const start = resolve(startDir);
  return hops(start, a) <= hops(start, b) ? a : b;
}

export function ancestorDirsInclusive(startDir: string, root: string): string[] {
  const start = resolve(startDir);
  const stop = resolve(root);
  const out: string[] = [];
  let dir = start;
  for (;;) {
    out.push(dir);
    if (dir === stop) {
      break;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return out;
}

/** Parent steps from `from` up to `to`; infinite when `to` is not an ancestor. */
export function hops(from: string, to: string): number {
  let dir = resolve(from);
  let n = 0;
  const target = resolve(to);
  while (dir !== target) {
    const parent = resolve(dir, "..");
    if (parent === dir) {
      return Number.POSITIVE_INFINITY;
    }
    dir = parent;
    n += 1;
  }
  return n;
}
