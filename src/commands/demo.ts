import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCheck } from "./check";
import type { CommandResult } from "./result";

/**
 * One-shot aha: build a throwaway fixture that reproduces the killer case
 * (PreToolUse → missing script), print the human report, clean up.
 *
 * Writes only under the system temp directory — never into the caller's cwd —
 * so `npx @chimix/agentscan demo` works with no project requirements.
 * Returns the report; the demo always exits 0.
 */
export function runDemo(): CommandResult {
  const root = mkdtempSync(join(tmpdir(), "agentscan-demo-"));
  try {
    const claude = join(root, ".claude");
    mkdirSync(claude, { recursive: true });
    writeFileSync(
      join(claude, "settings.json"),
      `${JSON.stringify(
        {
          hooks: {
            PreToolUse: [
              {
                hooks: [
                  {
                    type: "command",
                    command: ".claude/hooks/guard-destructive-bash.js",
                  },
                ],
              },
            ],
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const result = runCheck({ dir: root, colour: false });

    const intro =
      "Demo fixture: PreToolUse hook points at a script that is not on disk.\n" +
      "This is the failure agentscan exists for — the agent starts normally; the guard does not.\n\n";

    return { exitCode: 0, stdout: intro + result.stdout };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
