import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SkillscanConfig } from "../config/schema";
import { discoverAgentSurface } from "../discover/index";
import type { Facts } from "./types";

type PackageJson = {
  packageManager?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};

function readPackageJson(root: string): PackageJson {
  const path = join(root, "package.json");
  if (!existsSync(path)) {
    return {};
  }
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      return {};
    }
    return raw as PackageJson;
  } catch {
    return {};
  }
}

function inferPackageManager(
  root: string,
  pkg: PackageJson,
): Facts["packageManager"] {
  const field = pkg.packageManager;
  if (typeof field === "string" && field.length > 0) {
    const prefix = field.split("@")[0]?.toLowerCase() ?? "";
    if (
      prefix === "bun" ||
      prefix === "npm" ||
      prefix === "pnpm" ||
      prefix === "yarn"
    ) {
      return prefix;
    }
  }

  if (existsSync(join(root, "bun.lock")) || existsSync(join(root, "bun.lockb"))) {
    return "bun";
  }
  if (existsSync(join(root, "pnpm-lock.yaml"))) {
    return "pnpm";
  }
  if (existsSync(join(root, "yarn.lock"))) {
    return "yarn";
  }
  if (existsSync(join(root, "package-lock.json"))) {
    return "npm";
  }
  return "unknown";
}

function hasNextConfig(root: string): boolean {
  try {
    const entries = readdirSync(root);
    return entries.some(
      (name) =>
        name === "next.config.js" ||
        name === "next.config.mjs" ||
        name === "next.config.cjs" ||
        name === "next.config.ts" ||
        name === "next.config.mts",
    );
  } catch {
    return false;
  }
}

function readNextConfigText(root: string): string | undefined {
  const candidates = [
    "next.config.ts",
    "next.config.mjs",
    "next.config.js",
    "next.config.mts",
    "next.config.cjs",
  ];
  for (const name of candidates) {
    const path = join(root, name);
    if (!existsSync(path)) {
      continue;
    }
    try {
      return readFileSync(path, "utf8");
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function extractConfigs(
  root: string,
  deps: Record<string, string>,
  devDeps: Record<string, string>,
  scripts: Record<string, string>,
): Facts["configs"] {
  const configs: Facts["configs"] = {};

  if (existsSync(join(root, "components.json"))) {
    configs.shadcn = true;
  }

  if (
    existsSync(join(root, "biome.json")) ||
    existsSync(join(root, "biome.jsonc"))
  ) {
    configs.biome = true;
  }

  const allDeps = { ...deps, ...devDeps };
  const hasUltraciteDep = "ultracite" in allDeps;
  const hasUltraciteScript = Object.values(scripts).some((s) =>
    s.includes("ultracite"),
  );
  if (hasUltraciteDep || hasUltraciteScript) {
    configs.ultracite = true;
  }

  if ("next" in allDeps) {
    const next: NonNullable<Facts["configs"]["next"]> = {};
    if (hasNextConfig(root)) {
      next.appRouter = true;
      const text = readNextConfigText(root);
      if (text !== undefined) {
        // best-effort: cacheComponents: true (or experimental.cacheComponents)
        if (
          /\bcacheComponents\s*:\s*true\b/.test(text) ||
          /\bcacheComponents\s*:\s*!0\b/.test(text)
        ) {
          next.cacheComponents = true;
        } else if (
          /\bcacheComponents\s*:\s*false\b/.test(text) ||
          /\bcacheComponents\s*:\s*!1\b/.test(text)
        ) {
          next.cacheComponents = false;
        }
      }
    }
    configs.next = next;
  }

  return configs;
}

/**
 * Build immutable Facts snapshot from package.json + discovered agent surface.
 * No network. No disk writes.
 */
export function extractFacts(
  root: string,
  config: SkillscanConfig,
  opts?: { includeGlobal?: boolean },
): Facts {
  const includeGlobal = opts?.includeGlobal ?? config.includeGlobal;
  const pkg = readPackageJson(root);
  const dependencies = { ...(pkg.dependencies ?? {}) };
  const devDependencies = { ...(pkg.devDependencies ?? {}) };
  const scripts = { ...(pkg.scripts ?? {}) };

  const surface = discoverAgentSurface(root, config, { includeGlobal });

  return {
    root,
    packageManager: inferPackageManager(root, pkg),
    dependencies,
    devDependencies,
    scripts,
    configs: extractConfigs(root, dependencies, devDependencies, scripts),
    skills: surface.skills,
    agents: surface.agents,
    hooks: surface.hooks,
    mcp: surface.mcp,
    policyFiles: surface.policyFiles,
  };
}
