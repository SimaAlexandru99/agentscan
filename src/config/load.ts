import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { configSchema, type AgentscanConfig } from "./schema";

/**
 * Load agentscan config from `.agentscanrc.json` under `root`, or from `configPath`.
 * An absent implicit file means defaults; an explicit `--config` that does not
 * exist, invalid JSON, or a schema violation throws with the path (exit 2).
 */
export function loadConfig(root: string, configPath?: string): AgentscanConfig {
  const path = configPath ?? join(root, ".agentscanrc.json");

  if (!existsSync(path)) {
    if (configPath !== undefined) {
      throw new Error(`config file not found: ${path}`);
    }
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

  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid config at ${path}: ${issues}`);
  }
  return parsed.data;
}
