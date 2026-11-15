import { homedir } from "node:os";
import { resolve } from "node:path";

let scanned: string | undefined;

/** The home being scanned: `analyze({ home })`, else this user's home. */
export function userHome(): string {
  return scanned ?? homedir();
}

/**
 * An env var that relocates this user's own config (`CODEX_HOME`, `APPDATA`, ...).
 * Ignored while scanning another home: it belongs to the user running agentscan.
 * shortcut: a Windows home scanned from another account loses its `%APPDATA%`
 * locations (Claude Desktop, Zed, Goose); derive them from the home if that is ever needed.
 */
export function userEnv(name: string): string | undefined {
  return scanned === undefined ? process.env[name] : undefined;
}

/** Run `fn` with `home` as the scanned home. Synchronous, like the scan. */
export function withScannedHome<T>(home: string | undefined, fn: () => T): T {
  const previous = scanned;
  scanned = home === undefined ? undefined : resolve(home);
  try {
    return fn();
  } finally {
    scanned = previous;
  }
}
