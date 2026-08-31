import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SCAN_ROOT_MARKER } from "../../src/discover/shared";

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
