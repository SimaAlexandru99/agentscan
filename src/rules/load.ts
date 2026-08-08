import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { ruleDefinitionSchema, type RuleDefinition } from "./schema";

function isYamlFile(name: string): boolean {
  return name.endsWith(".yaml") || name.endsWith(".yml");
}

function loadRulesFromDir(dir: string): RuleDefinition[] {
  if (!existsSync(dir)) {
    return [];
  }

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }

  const rules: RuleDefinition[] = [];

  for (const name of entries.sort()) {
    if (!isYamlFile(name)) {
      continue;
    }
    const path = join(dir, name);
    let raw: unknown;
    try {
      const text = readFileSync(path, "utf8");
      raw = parseYaml(text) as unknown;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Invalid rule YAML at ${path}: ${message}`);
    }

    const parsed = ruleDefinitionSchema.safeParse(raw);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      throw new Error(`Invalid rule at ${path}: ${detail}`);
    }
    rules.push(parsed.data);
  }

  return rules;
}

/**
 * Load builtin (+ optional user) YAML rules. Missing dirs → empty.
 * One rule per id — a user rule replaces the builtin it shadows, keeping the
 * builtin's position so ordering stays stable. Without this, both would run and
 * emit two findings sharing one `id`.
 * Filters out ids listed in `ignoreRules`.
 */
export function loadRules(options: {
  builtinDir: string;
  userRulesDir?: string;
  ignoreRules: string[];
}): RuleDefinition[] {
  const { builtinDir, userRulesDir, ignoreRules } = options;
  const ignore = new Set(ignoreRules);

  const byId = new Map<string, RuleDefinition>();
  for (const rule of [
    ...loadRulesFromDir(builtinDir),
    ...(userRulesDir ? loadRulesFromDir(userRulesDir) : []),
  ]) {
    byId.set(rule.id, rule);
  }

  return [...byId.values()].filter((rule) => !ignore.has(rule.id));
}
