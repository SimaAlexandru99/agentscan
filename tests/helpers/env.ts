import { spyOn } from "bun:test";
import * as os from "node:os";

/**
 * Tests that simulate a user home mock `os.homedir()`. Every provider also
 * honours an env override that wins over `homedir()`, so a developer with
 * `CODEX_HOME` (or a sibling) exported saw those tests fail on their machine
 * while CI stayed green. Clear the overrides once for the whole suite; the
 * tests that need one set and restore it themselves.
 */
for (const key of ["CODEX_HOME", "GROK_HOME", "CLAUDE_CONFIG_DIR", "COPILOT_HOME"]) {
  delete process.env[key];
}


/** Run `fn` with `os.homedir()` returning `dir`, restoring it afterwards. */
export function withHome<T>(dir: string, fn: () => T): T {
  const spy = spyOn(os, "homedir").mockReturnValue(dir);
  try {
    return fn();
  } finally {
    spy.mockRestore();
  }
}

/** Run `fn` with `vars` set in `process.env` (`undefined` deletes), restoring every key afterwards. */
export function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const previous = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  const apply = (values: Record<string, string | undefined>) => {
    for (const [k, v] of Object.entries(values)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
  apply(vars);
  try {
    return fn();
  } finally {
    apply(previous);
  }
}
