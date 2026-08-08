#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { runCheck } from "./commands/check";
import type { FailOn } from "./report/exit-code";
import { VERSION } from "./version";

function printHelp(): void {
  const text = `skillscan v${VERSION}

Usage:
  skillscan check [dir] [options]
  skillscan explain <findingId>
  skillscan rules
  skillscan init
  skillscan --version
  skillscan --help

check options:
  --json                 JSON report
  --quiet                Summary only
  --verbose              Show KEEP findings
  --fail-on <level>      never | warning | error (default: never)
  --global               Also scan global skill dirs
  --config <path>        Config file path
  --rules-dir <path>     User rules directory
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
        global: { type: "boolean", default: false },
        config: { type: "string" },
        "rules-dir": { type: "string" },
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
    process.stderr.write(`${message}\n`);
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
            `Invalid --fail-on value: ${failOnRaw} (use never|warning|error)\n`,
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
      case "explain":
      case "rules":
      case "init":
        process.stderr.write(
          `Command "${command}" is not implemented yet\n`,
        );
        return 2;
      case "help":
        printHelp();
        return 0;
      case "version":
        process.stdout.write(`${VERSION}\n`);
        return 0;
      default:
        process.stderr.write(`Unknown command: ${command}\n`);
        printHelp();
        return 2;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`${message}\n`);
    return 2;
  }
}

if (import.meta.main) {
  const code = await main(process.argv.slice(2));
  process.exit(code);
}
