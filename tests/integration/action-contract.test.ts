import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";

const actionPath = join(import.meta.dir, "../..", "action.yml");

type ActionStep = { id?: string; run?: string; env?: Record<string, string> };
type ActionManifest = { runs?: { steps?: ActionStep[] } };

function scanStep(): ActionStep {
  const action = parse(readFileSync(actionPath, "utf8")) as ActionManifest;
  const step = action.runs?.steps?.find((candidate) => candidate.id === "scan");
  if (step === undefined || step.run === undefined) {
    throw new Error("action.yml scan step is missing its shell script");
  }
  return step;
}

function scanScript(): string {
  return scanStep().run as string;
}

function fakeBun(path: string): void {
  writeFileSync(
    path,
    [
      "#!/bin/sh",
      'printf \'%s\\n\' "$@" > "$AGENTSCAN_CAPTURE"',
      "printf 'first report line\\nsecond report line\\n'",
      'exit "${AGENTSCAN_BUN_EXIT:-0}"',
      "",
    ].join("\n"),
    "utf8",
  );
  chmodSync(path, 0o755);
}

describe("composite Action scan contract", () => {
  test("forwards quoted arguments and preserves the multiline output delimiter", () => {
    expect(scanStep().env).toEqual({
      AGENTSCAN_PATH: "${{ inputs.path }}",
      AGENTSCAN_FAIL_ON: "${{ inputs.fail-on }}",
      AGENTSCAN_FAIL_UNDER: "${{ inputs.fail-under }}",
      AGENTSCAN_OUTPUT: "${{ inputs.output }}",
      AGENTSCAN_GLOBAL: "${{ inputs.global }}",
      AGENTSCAN_ACTION_PATH: "${{ github.action_path }}",
    });

    const root = mkdtempSync(join(tmpdir(), "agentscan-action-contract-"));
    const bun = join(root, "bun");
    const capture = join(root, "captured-args");
    const githubOutput = join(root, "github-output");
    fakeBun(bun);

    const result = spawnSync("bash", ["-c", scanScript()], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${root}:${process.env.PATH ?? ""}`,
        AGENTSCAN_PATH: "/tmp/project with spaces",
        AGENTSCAN_FAIL_ON: "warning",
        AGENTSCAN_FAIL_UNDER: "42",
        AGENTSCAN_OUTPUT: "prompt",
        AGENTSCAN_GLOBAL: "true",
        AGENTSCAN_ACTION_PATH: "/tmp/action path",
        AGENTSCAN_CAPTURE: capture,
        AGENTSCAN_BUN_EXIT: "1",
        GITHUB_OUTPUT: githubOutput,
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    expect(readFileSync(capture, "utf8").split("\n").filter(Boolean)).toEqual([
      "/tmp/action path/src/cli.ts",
      "check",
      "/tmp/project with spaces",
      "--fail-on",
      "warning",
      "--output",
      "prompt",
      "--fail-under",
      "42",
      "--global",
    ]);
    expect(result.stdout).toBe("first report line\nsecond report line\n");
    // The delimiter is randomised per run, so match its shape and require the
    // opening and closing markers to be the same string.
    const written = readFileSync(githubOutput, "utf8");
    const delim = /^report<<(AGENTSCAN_EOF_[0-9a-f]{32})$/m.exec(written)?.[1];
    expect(delim).toBeDefined();
    expect(written).toBe(
      "exit-code=1\n" +
        `report<<${delim}\n` +
        "first report line\n" +
        "second report line\n" +
        `${delim}\n`,
    );
  });

  test("invalid values stop before the CLI is invoked", () => {
    const root = mkdtempSync(join(tmpdir(), "agentscan-action-invalid-"));
    const bun = join(root, "bun");
    const marker = join(root, "called");
    const githubOutput = join(root, "github-output");
    writeFileSync(
      bun,
      '#!/bin/sh\nprintf called > "$AGENTSCAN_MARKER"\n',
      "utf8",
    );
    chmodSync(bun, 0o755);

    const result = spawnSync("bash", ["-c", scanScript()], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${root}:${process.env.PATH ?? ""}`,
        AGENTSCAN_PATH: ".",
        AGENTSCAN_FAIL_ON: "fatal",
        AGENTSCAN_FAIL_UNDER: "",
        AGENTSCAN_OUTPUT: "human",
        AGENTSCAN_GLOBAL: "false",
        AGENTSCAN_ACTION_PATH: "/tmp/action",
        AGENTSCAN_MARKER: marker,
        GITHUB_OUTPUT: githubOutput,
      },
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Invalid fail-on value");
    expect(existsSync(marker)).toBe(false);
    expect(existsSync(githubOutput)).toBe(false);
  });
});
