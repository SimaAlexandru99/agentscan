import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type OutputFormat, runCheck } from "./check";

export type DemoOptions = {
  /** Alias for `output: "json"`, kept for the documented `--json` flag. */
  json?: boolean;
  output?: OutputFormat;
  verbose?: boolean;
  quiet?: boolean;
  colour?: boolean;
};

export type DemoResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

/**
 * Write a deliberately broken project to a scratch directory the command owns.
 *
 * It stages the three headline categories from the README so the report is
 * worth reading on a machine with no agent config of its own: a hook whose
 * script is gone, an MCP server that cannot start, and a skill the lockfile
 * pins but never installed.
 */
function writeThrowawayProject(root: string): void {
  mkdirSync(join(root, ".claude"), { recursive: true });

  writeFileSync(
    join(root, "package.json"),
    `${JSON.stringify(
      { name: "agentscan-demo", private: true, dependencies: {} },
      null,
      2,
    )}\n`,
    "utf8",
  );

  // A PreToolUse guard whose script was deleted: registered, but it never runs.
  writeFileSync(
    join(root, ".claude", "settings.json"),
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

  // An MCP server with neither `command` nor `url`: its tools never load.
  writeFileSync(
    join(root, ".mcp.json"),
    `${JSON.stringify(
      { mcpServers: { search: { description: "no command and no url" } } },
      null,
      2,
    )}\n`,
    "utf8",
  );

  // A lockfile pinning a skill that is not on disk.
  writeFileSync(
    join(root, "skills-lock.json"),
    `${JSON.stringify(
      {
        version: 1,
        skills: {
          "guard-rails": {
            source: "acme/skills",
            sourceType: "github",
            skillPath: "skills/guard-rails/SKILL.md",
            computedHash:
              "0000000000000000000000000000000000000000000000000000000000000000",
          },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

/**
 * Scan a throwaway broken project and print its report, for someone who wants
 * to see what agentscan finds without a project of their own to point at.
 *
 * The fixture is written under the OS temp directory and removed in `finally`,
 * even when the scan throws: the tree agentscan scans is still never the user's,
 * and nothing here opens a socket. Exit is always 0 — the findings are staged
 * on purpose, not a verdict on the caller's machine.
 */
export async function runDemo(options: DemoOptions = {}): Promise<DemoResult> {
  const parent = mkdtempSync(join(tmpdir(), "agentscan-demo-"));
  const root = join(parent, "agentscan-demo");
  try {
    writeThrowawayProject(root);
    const result = await runCheck({
      dir: root,
      json: options.json,
      ...(options.output === undefined ? {} : { output: options.output }),
      verbose: options.verbose,
      quiet: options.quiet,
      colour: options.colour,
      // A demo is a showcase, not a gate: the fixture is broken on purpose, so
      // its findings must never become a non-zero exit.
      failOn: "never",
    });
    return {
      exitCode: 0,
      stdout: result.stdout,
      stderr:
        "agentscan demo — these findings come from a throwaway project that was created, scanned, and deleted; your own files were not touched and nothing left your machine.\n",
    };
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}
