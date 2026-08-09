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
  /** ANSI colour and the header box. Only ever honoured for `human`. */
  colour?: boolean;
};

export type CheckResult = {
  exitCode: number;
  stdout: string;
  /**
   * The same report with no escapes, present only when `stdout` has colour.
   *
   * `--copy` needs it: the clipboard is not a terminal, and pasting a report
   * full of escape codes into an issue is worse than no colour at all.
   */
  plain?: string;
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
  let plain: string | undefined;
  if (format === "json") {
    stdout = renderJson({ version: VERSION, root, facts, findings, resolvedFrom });
  } else if (format === "prompt") {
    stdout = renderPrompt({ version: VERSION, facts, findings });
  } else {
    // Colour is a `human` concern only. A machine-readable format carrying
    // escapes would break every consumer the README tells people to pipe into.
    const text = (colour: boolean): string =>
      renderText({
        version: VERSION,
        facts,
        findings,
        resolvedFrom,
        verbose: options.verbose ?? false,
        quiet: options.quiet ?? false,
        colour,
      });
    stdout = text(options.colour === true);
    if (options.colour === true) {
      plain = text(false);
    }
  }

  return {
    exitCode: exitCode(findings, config.failOn, options.failUnder),
    stdout,
    ...(plain === undefined ? {} : { plain }),
  };
}
