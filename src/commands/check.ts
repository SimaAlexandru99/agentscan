import { analyze } from "../analyze";
import { exitCode, type FailOn } from "../report/exit-code";
import { renderJson } from "../report/json";
import { renderPrompt } from "../report/prompt";
import { renderText } from "../report/text";
import { VERSION } from "../version";

export type OutputFormat = "human" | "json" | "prompt";

export type CheckOptions = {
  dir?: string;
  /** Alias for `output: "json"`, kept for the documented `--json` flag. */
  json?: boolean;
  output?: OutputFormat;
  quiet?: boolean;
  verbose?: boolean;
  failOn?: FailOn;
  /** Fail when the 0-100 score drops below this. */
  failUnder?: number;
  global?: boolean;
  configPath?: string;
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
  const { root, resolvedFrom, config, facts, findings } = analyze({
    dir: options.dir,
    global: options.global,
    configPath: options.configPath,
    failOn: options.failOn,
  });

  const format: OutputFormat =
    options.output ?? (options.json === true ? "json" : "human");

  let stdout: string;
  if (format === "json") {
    stdout = renderJson({ version: VERSION, root, facts, findings, resolvedFrom });
  } else if (format === "prompt") {
    stdout = renderPrompt({ version: VERSION, facts, findings });
  } else {
    stdout = renderText({
      version: VERSION,
      facts,
      findings,
      resolvedFrom,
      verbose: options.verbose ?? false,
      quiet: options.quiet ?? false,
    });
  }

  return {
    exitCode: exitCode(findings, config.failOn, options.failUnder),
    stdout,
  };
}
