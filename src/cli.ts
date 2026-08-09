#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { runCheck } from "./commands/check";
import { runExplain } from "./commands/explain";
import { runInit } from "./commands/init";
import { runRulesCommand } from "./commands/rules";
import { safe } from "./report/safe";
import type { FailOn } from "./report/exit-code";
import { VERSION } from "./version";

function printHelp(): void {
  const text = `agentscan v${VERSION}

Usage:
  agentscan check [dir] [options]
  agentscan explain <findingId> [dir]
  agentscan rules [dir]
  agentscan init [dir] [--force]
  agentscan --version
  agentscan --help


check options:
  --json                 JSON report
  --quiet                Summary only
  --verbose              Show KEEP findings
  --fail-on <level>      never | warning | error (default: never)
  --global               Also scan global skill dirs
  --config <path>        Config file path
  --rules-dir <path>     User rules directory

init options:
  --force                Overwrite existing .agentscanrc.json
`;
  process.stdout.write(`${text}\n`);
}

function isFailOn(value: string): value is FailOn {
  return value === "never" || value === "warning" || value === "error";
}

export async function main(argv: string[]): Promise<number> {
  let values: {
    json?: boolean;
    quiet?: boolean;
    verbose?: boolean;
    "fail-on"?: string;
    global?: boolean;
    config?: string;
    "rules-dir"?: string;
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
        quiet: { type: "boolean", default: false },
        verbose: { type: "boolean", default: false },
        "fail-on": { type: "string" },
        // No default: absent must be `undefined` so `?? config.includeGlobal`
        // in analyze() can fall through. With `default: false` the flag always
        // overwrote the config key, making `includeGlobal` unreachable.
        global: { type: "boolean" },
        config: { type: "string" },
        "rules-dir": { type: "string" },
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

  if (values.help || positionals.length === 0) {
    printHelp();
    return 0;
  }

  const command = positionals[0];
  if (command === undefined) {
    printHelp();
    return 0;
  }

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
        const result = await runCheck({
          dir,
          json: values.json,
          quiet: values.quiet,
          verbose: values.verbose,
          failOn: failOnRaw,
          global: values.global,
          configPath: values.config,
          rulesDir: values["rules-dir"],
        });
        process.stdout.write(result.stdout);
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
          rulesDir: values["rules-dir"],
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
          rulesDir: values["rules-dir"],
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
