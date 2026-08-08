import { analyze } from "../analyze";
import { exitCode, type FailOn } from "../report/exit-code";
import { renderJson } from "../report/json";
import { renderText } from "../report/text";
import { VERSION } from "../version";

export type CheckOptions = {
  dir?: string;
  json?: boolean;
  quiet?: boolean;
  verbose?: boolean;
  failOn?: FailOn;
  global?: boolean;
  configPath?: string;
  rulesDir?: string;
};

export type CheckResult = {
  exitCode: number;
  stdout: string;
};

/**
 * Run the full check pipeline (discover → facts → rules + checks → report).
 * Returns exit code + stdout for testability; CLI prints and process.exit.
 */
export async function runCheck(options: CheckOptions): Promise<CheckResult> {
  const { root, config, facts, findings } = analyze({
    dir: options.dir,
    global: options.global,
    configPath: options.configPath,
    rulesDir: options.rulesDir,
    failOn: options.failOn,
  });

  const stdout = options.json
    ? renderJson({ version: VERSION, root, facts, findings })
    : renderText({
        version: VERSION,
        facts,
        findings,
        verbose: options.verbose ?? false,
        quiet: options.quiet ?? false,
      });

  return {
    exitCode: exitCode(findings, config.failOn),
    stdout,
  };
}
