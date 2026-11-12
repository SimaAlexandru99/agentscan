import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { SCAN_ROOT_MARKER, type ScanContext } from "../../src/discover/scan-context";

/**
 * Temp project root that cannot walk into a dirty `/tmp/.git` or `/tmp/.agents`.
 * Pair with the product pin in `resolveScanContext`.
 */
export function mkPinnedRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  writeFileSync(join(root, SCAN_ROOT_MARKER), "", "utf8");
  return root;
}

export function mkPinnedProject(prefix: string, pkgName = "fixture"): string {
  const root = mkPinnedRoot(prefix);
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: pkgName }), "utf8");
  return root;
}

/**
 * Scan context rooted at `root` with no walk-up beyond it: every location is
 * `root` unless `startDir` names a deeper working directory.
 */
export function scanContext(
  root: string,
  opts: { startDir?: string; scanBoundary?: string } = {},
): ScanContext {
  return {
    root,
    startDir: opts.startDir ?? root,
    scanBoundary: opts.scanBoundary ?? root,
  };
}

/** Pinned project root with a `package.json`; the shared name for {@link mkPinnedProject}. */
export const tmpProject = mkPinnedProject;

/** Write `body` to `root/rel`, creating parent directories. */
export function write(root: string, rel: string, body: string): void {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, body, "utf8");
}
