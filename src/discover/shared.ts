import { join } from "node:path";
import { toPosix } from "../facts/paths";
import { listDir, type ScanIO } from "./fs";

export const POLICY_CAP = 100_000;

/**
 * Traversal bounds for every in-tree walk.
 *
 * Shared so the two walks that exist — nested skill directories and in-tree
 * plugin roots — cannot drift into disagreeing about what a project contains.
 *
 * Depth 8 bounds arbitrary trees; raise it if deeper package roots become supported.
 */
export const NESTED_DISCOVERY_MAX_DEPTH = 8;
export const NESTED_DISCOVERY_SKIP = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "build",
  "coverage",
  "vendor",
]);
/** Directory paths (posix tails) never holding agent config; podman volumes there are often EACCES. */
const NESTED_DISCOVERY_SKIP_PATHS = ["/.local/share/containers"];

export function walkFiles(
  dir: string,
  opts: {
    maxDepth: number;
    match: (absPath: string, name: string) => boolean;
    io: ScanIO;
  },
  depth = 0,
): string[] {
  const out: string[] = [];
  for (const entry of listDir(dir, opts.io, { optional: true }) ?? []) {
    if (NESTED_DISCOVERY_SKIP.has(entry.name)) {
      continue;
    }
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (NESTED_DISCOVERY_SKIP_PATHS.some((tail) => toPosix(abs).endsWith(tail))) {
        continue;
      }
      if (depth >= opts.maxDepth) {
        continue;
      }
      out.push(...walkFiles(abs, opts, depth + 1));
      continue;
    }
    if (entry.isFile() && opts.match(abs, entry.name)) {
      out.push(abs);
    }
  }
  return out;
}
