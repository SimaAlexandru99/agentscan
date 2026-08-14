import { parseArgs } from "node:util";
import { type OutputFormat, runCheck } from "./commands/check";
import { runDemo } from "./commands/demo";
import { runExplain } from "./commands/explain";
import { runInit } from "./commands/init";
import { runRulesCommand } from "./commands/rules";
import { shouldColour } from "./report/ansi";
import { copyToClipboard } from "./report/clipboard";
import { safe } from "./report/safe";
import type { FailOn } from "./report/exit-code";
import { VERSION } from "./version";

function printHelp(): void {
  const text = `agentscan v${VERSION}

Usage:
  agentscan                            scan the current directory
  agentscan check [dir] [options]
  agentscan demo                       scan a throwaway broken project, then delete it
  agentscan explain <findingId> [dir]
  agentscan rules [dir]
  agentscan init [dir] [--force]
  agentscan --version
  agentscan --help


check options:
  --json                 JSON report (alias for --output json)
  --output <format>      human (default) | json | prompt
                         prompt: a paste-ready handoff for a fixing agent
  --copy                 Also copy the report to the system clipboard
  --no-color             Never colour, even on a terminal (also: NO_COLOR=1)
  --quiet                Summary only
  --verbose              Show KEEP findings
  --fail-on <level>      never | warning | error (default: never)
  --fail-under <0-100>   Fail when the score drops below this floor
  --global               Also scan global skill dirs
  --config <path>        Config file path

init options:
  --force                Overwrite existing .agentscanrc.json
`;
  process.stdout.write(`${text}\n`);
}

function isOutput(value: string): value is OutputFormat {
  return value === "human" || value === "json" || value === "prompt";
}

function isFailOn(value: string): value is FailOn {
  return value === "never" || value === "warning" || value === "error";
}

export async function main(argv: string[]): Promise<number> {
  let values: {
    json?: boolean;
    output?: string;
    copy?: boolean;
    "no-color"?: boolean;
    quiet?: boolean;
    verbose?: boolean;
    "fail-on"?: string;
    "fail-under"?: string;
    global?: boolean;
    config?: string;
    force?: boolean;
    help?: boolean;
    version?: boolean;
  };
  let positionals: string[];

  try {
    const parsed = parseArgs({
      args: argv,
      options: {
        json: { type: "boolean", default: false },
        output: { type: "string" },
        copy: { type: "boolean", default: false },
        "no-color": { type: "boolean", default: false },
        quiet: { type: "boolean", default: false },
        verbose: { type: "boolean", default: false },
        "fail-on": { type: "string" },
        "fail-under": { type: "string" },
        // No default: absent must be `undefined` so `?? config.includeGlobal`
        // in analyze() can fall through. With `default: false` the flag always
        // overwrote the config key, making `includeGlobal` unreachable.
        global: { type: "boolean" },
        config: { type: "string" },
        force: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
        version: { type: "boolean", short: "V", default: false },
      },
      allowPositionals: true,
      strict: true,
    });
    values = parsed.values;
    positionals = parsed.positionals;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`${safe(message)}\n`);
    return 2;
  }

  if (values.version) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }

  if (values.help) {
    printHelp();
    return 0;
  }

  // No subcommand means scan the current directory. Someone who ran
  // `npx @chimix/agentscan@latest` to find out what this does should see their
  // own project's findings, not a usage screen; `--help` still prints one.
  const command = positionals[0] ?? "check";

  try {
    switch (command) {
      case "check": {
        const dir = positionals[1];
        const failOnRaw = values["fail-on"];
        if (failOnRaw !== undefined && !isFailOn(failOnRaw)) {
          process.stderr.write(
            `Invalid --fail-on value: ${safe(failOnRaw)} (use never|warning|error)\n`,
          );
          return 2;
        }
        const failUnderRaw = values["fail-under"];
        let failUnder: number | undefined;
        if (failUnderRaw !== undefined) {
          failUnder = Number(failUnderRaw);
          if (!Number.isInteger(failUnder) || failUnder < 0 || failUnder > 100) {
            process.stderr.write(
              `Invalid --fail-under value: ${safe(failUnderRaw)} (use 0-100)\n`,
            );
            return 2;
          }
        }
        const outputRaw = values.output;
        if (outputRaw !== undefined && !isOutput(outputRaw)) {
          process.stderr.write(
            `Invalid --output value: ${safe(outputRaw)} (use human|json|prompt)\n`,
          );
          return 2;
        }
        const result = await runCheck({
          dir,
          json: values.json,
          ...(outputRaw === undefined ? {} : { output: outputRaw }),
          quiet: values.quiet,
          verbose: values.verbose,
          failOn: failOnRaw,
          ...(failUnder === undefined ? {} : { failUnder }),
          global: values.global,
          configPath: values.config,
          colour: shouldColour({
            isTTY: process.stdout.isTTY === true,
            env: process.env,
            noColorFlag: values["no-color"],
          }),
        });
        process.stdout.write(result.stdout);
        if (values.copy === true) {
          // stderr, so `--copy` stays composable with `> file` and `| tool`.
          // A clipboard miss does not change the exit code: the scan is what
          // was asked for, and its result is already on stdout.
          // The plain render when one exists: escape codes pasted into an
          // issue are worse than no colour.
          const copied = await copyToClipboard(result.plain ?? result.stdout);
          process.stderr.write(
            copied.ok
              ? `Copied to clipboard via ${copied.tool}.\n`
              : `Could not copy: ${safe(copied.reason)}. Redirect instead: agentscan check > report.md\n`,
          );
        }
        return result.exitCode;
      }
      case "demo": {
        const outputRaw = values.output;
        if (outputRaw !== undefined && !isOutput(outputRaw)) {
          process.stderr.write(
            `Invalid --output value: ${safe(outputRaw)} (use human|json|prompt)\n`,
          );
          return 2;
        }
        const result = await runDemo({
          json: values.json,
          ...(outputRaw === undefined ? {} : { output: outputRaw }),
          quiet: values.quiet,
          verbose: values.verbose,
          colour: shouldColour({
            isTTY: process.stdout.isTTY === true,
            env: process.env,
            noColorFlag: values["no-color"],
          }),
        });
        process.stdout.write(result.stdout);
        if (result.stderr.length > 0) {
          process.stderr.write(result.stderr);
        }
        return result.exitCode;
      }
      case "explain": {
        const findingId = positionals[1];
        if (findingId === undefined || findingId.length === 0) {
          process.stderr.write("Usage: agentscan explain <findingId> [dir]\n");
          return 2;
        }
        const result = await runExplain(findingId, {
          dir: positionals[2],
          global: values.global,
          configPath: values.config,
        });
        if (result.stderr.length > 0) {
          process.stderr.write(result.stderr);
        }
        if (result.stdout.length > 0) {
          process.stdout.write(result.stdout);
        }
        return result.exitCode;
      }
      case "rules": {
        const result = await runRulesCommand({
          dir: positionals[1],
          configPath: values.config,
        });
        process.stdout.write(result.stdout);
        return result.exitCode;
      }
      case "init": {
        const result = await runInit(positionals[1], {
          force: values.force,
        });
        if (result.stderr.length > 0) {
          process.stderr.write(result.stderr);
        }
        if (result.stdout.length > 0) {
          process.stdout.write(result.stdout);
        }
        return result.exitCode;
      }
      case "help":
        printHelp();
        return 0;
      case "version":
        process.stdout.write(`${VERSION}\n`);
        return 0;
      default:
        process.stderr.write(`Unknown command: ${safe(command)}\n`);
        printHelp();
        return 2;
    }
  } catch (err) {
    // A fatal message can quote a path from the scanned tree, and a POSIX
    // filename may contain a newline or an escape sequence.
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`${safe(message)}\n`);
    return 2;
  }
}

if (import.meta.main) {
  const code = await main(process.argv.slice(2));
  process.exit(code);
}
