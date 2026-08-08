import { join } from "node:path";
import { loadConfig } from "../config/load";
import { resolveRoot } from "../discover/index";
import { loadRules } from "../rules/load";

export type RulesCommandOptions = {
  dir?: string;
  configPath?: string;
  rulesDir?: string;
};

export type RulesCommandResult = {
  exitCode: number;
  stdout: string;
};

/**
 * Load builtin + user rules and print `id` + description (one per line).
 */
export async function runRulesCommand(
  options: RulesCommandOptions = {},
): Promise<RulesCommandResult> {
  const root = resolveRoot(options.dir ?? process.cwd());
  const config = loadConfig(root, options.configPath);

  const builtinDir = join(import.meta.dir, "../rules/builtin");
  const userRulesDir =
    options.rulesDir ?? join(root, ".skillscan", "rules");
  const rules = loadRules({
    builtinDir,
    userRulesDir,
    ignoreRules: config.ignoreRules,
  });

  const lines = rules.map((rule) => {
    const desc = rule.description ?? "";
    return desc.length > 0 ? `${rule.id}  ${desc}` : rule.id;
  });

  const stdout =
    lines.length > 0 ? `${lines.join("\n")}\n` : "";

  return { exitCode: 0, stdout };
}
