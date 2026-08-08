import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { configSchema, type SkillscanConfig } from "./schema";

/**
 * Load skillscan config from `.skillscanrc.json` under `root`, or from `configPath`.
 * Missing file → defaults via schema. Invalid JSON throws Error with path (exit 2).
 */
export function loadConfig(root: string, configPath?: string): SkillscanConfig {
  const path = configPath ?? join(root, ".skillscanrc.json");

  if (!existsSync(path)) {
    return configSchema.parse({});
  }

  let raw: unknown;
  try {
    const text = readFileSync(path, "utf8");
    raw = JSON.parse(text) as unknown;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid config JSON at ${path}: ${message}`);
  }

  return configSchema.parse(raw);
}
