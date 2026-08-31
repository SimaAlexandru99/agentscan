/** Official Codex values. See docs/spec/codex-*.md (read 2026-08-31). */

import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Config-advanced: `CODEX_HOME` defaults to `~/.codex`.
 * Never used to open `auth.json` or profile files.
 */
export function codexHomeDir(): string {
  const override = process.env.CODEX_HOME?.trim();
  if (override !== undefined && override.length > 0) {
    return override;
  }
  return join(homedir(), ".codex");
}
