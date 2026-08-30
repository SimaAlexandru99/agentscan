import { ignoreRuleSet } from "../checks/aliases";
import { STRUCTURAL_CHECKS } from "../checks/index";
import { loadConfig } from "../config/load";
import { resolveRoot } from "../discover/index";

export type RulesCommandOptions = {
  dir?: string;
  configPath?: string;
};

export type RulesCommandResult = {
  exitCode: number;
  stdout: string;
};

/**
 * Print every id that can produce a finding, as `id  description`, one per line.
 *
 * The ids are the ones `ignoreRules` takes, and each finding's id starts with
 * one of them, so this is also the index for `ignoreFindings`.
 */
export async function runRulesCommand(
  options: RulesCommandOptions = {},
): Promise<RulesCommandResult> {
  const root = resolveRoot(options.dir ?? process.cwd());
  const config = loadConfig(root, options.configPath);

  const ignored = ignoreRuleSet(config.ignoreRules);
  const lines = STRUCTURAL_CHECKS.filter((c) => !ignored.has(c.id)).map(
    (c) => `${c.id}  ${c.description}`,
  );

  return {
    exitCode: 0,
    stdout: lines.length > 0 ? `${lines.join("\n")}\n` : "",
  };
}
