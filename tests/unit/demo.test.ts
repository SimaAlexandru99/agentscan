import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDemo } from "../../src/commands/demo";

describe("runDemo", () => {
  test("prints the killer claude.hook.missing-script finding and cleans up", () => {
    const before = new Set(readdirSync(tmpdir()));
    const { exitCode, stdout } = runDemo();
    const after = readdirSync(tmpdir());

    expect(stdout).toContain("claude.hook.missing-script");
    expect(stdout).toContain("guard-destructive-bash.js");
    expect(stdout).toContain("PreToolUse");
    expect(stdout).toContain("ERROR");
    expect(exitCode).toBe(0);

    // Temp fixture must not linger.
    for (const name of after) {
      if (!before.has(name) && name.startsWith("agentscan-demo-")) {
        expect(existsSync(join(tmpdir(), name))).toBe(false);
      }
    }
  });
});
