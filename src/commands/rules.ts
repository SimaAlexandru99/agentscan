import { join } from "node:path";
import { STRUCTURAL_CHECKS } from "../checks/index";
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
 * Print every id that can produce a finding — structural checks first, then
 * YAML rules — as `id  description`, one per line.
 */
export async function runRulesCommand(
  options: RulesCommandOptions = {},
): Promise<RulesCommandResult> {
  const root = resolveRoot(options.dir ?? process.cwd());
  const config = loadConfig(root, options.configPath);

  const builtinDir = join(import.meta.dir, "../rules/builtin");
  const userRulesDir =
    options.rulesDir ?? join(root, ".agentscan", "rules");
  const rules = loadRules({
    builtinDir,
    userRulesDir,
    ignoreRules: config.ignoreRules,
  });

  const ignored = new Set(config.ignoreRules);
  const lines: string[] = [];

  for (const check of STRUCTURAL_CHECKS) {
    if (ignored.has(check.id)) {
      continue;
    }
    lines.push(`${check.id}  ${check.description}`);
  }
  for (const rule of rules) {
    const desc = rule.description ?? "";
    lines.push(desc.length > 0 ? `${rule.id}  ${desc}` : rule.id);
  }

  const stdout = lines.length > 0 ? `${lines.join("\n")}\n` : "";

  return { exitCode: 0, stdout };
}
