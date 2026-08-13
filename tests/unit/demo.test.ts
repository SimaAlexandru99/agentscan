import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDemo } from "../../src/commands/demo";

describe("runDemo", () => {
  test("prints the killer hook.missing-script finding and cleans up", async () => {
    const before = new Set(readdirSync(tmpdir()));
    const result = await runDemo();
    const after = readdirSync(tmpdir());

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("hook.missing-script");
    expect(result.stdout).toContain("guard-destructive-bash.js");
    expect(result.stdout).toContain("PreToolUse");
    expect(result.stdout).toContain("ERROR");

    // Temp fixture must not linger.
    for (const name of after) {
      if (!before.has(name) && name.startsWith("agentscan-demo-")) {
        expect(existsSync(join(tmpdir(), name))).toBe(false);
      }
    }
  });
});
