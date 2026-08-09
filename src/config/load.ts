import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { configSchema, type AgentscanConfig } from "./schema";

/**
 * Load agentscan config from `.agentscanrc.json` under `root`, or from `configPath`.
 * Missing file → defaults via schema. Invalid JSON throws Error with path (exit 2).
 */
export function loadConfig(root: string, configPath?: string): AgentscanConfig {
  const path = configPath ?? join(root, ".agentscanrc.json");

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
