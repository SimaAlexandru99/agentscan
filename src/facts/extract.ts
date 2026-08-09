import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentscanConfig } from "../config/schema";
import { discoverAgentSurface } from "../discover/index";
import type { ConfigErrorFact, Facts } from "./types";

type PackageJson = {
  packageManager?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};

/**
 * A package.json that will not parse is a config issue like any other — every
 * dependency-based rule would otherwise silently evaluate against an empty
 * project and report nothing wrong.
 */
function readPackageJson(
  root: string,
  errors: ConfigErrorFact[],
): PackageJson {
  const path = join(root, "package.json");
  if (!existsSync(path)) {
    return {};
  }
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    errors.push({
      path,
      kind: "unreadable",
      detail: err instanceof Error ? err.message : String(err),
    });
    return {};
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch (err) {
    errors.push({
      path,
      kind: "invalid-json",
      detail: err instanceof Error ? err.message : String(err),
    });
    return {};
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    errors.push({
      path,
      kind: "unexpected-shape",
      detail: "package.json is not a JSON object",
    });
    return {};
  }

  const obj = raw as Record<string, unknown>;
  const pkg: PackageJson = {};
  if (typeof obj.packageManager === "string") {
    pkg.packageManager = obj.packageManager;
  }
  for (const field of ["dependencies", "devDependencies", "scripts"] as const) {
    const kept = stringEntries(obj[field]);
    if (kept === undefined) {
      continue;
    }
    if (kept.dropped > 0) {
      // Name the field and the count — never the discarded value, which can be
      // a token pasted into a script.
      errors.push({
        path,
        kind: "unexpected-shape",
        detail: `${field}: ${kept.dropped} entr${kept.dropped === 1 ? "y" : "ies"} ignored (value is not a string)`,
      });
    }
    pkg[field] = kept.values;
  }
  return pkg;
}

/**
 * Keep only string-valued entries. The `as PackageJson` assertion this replaces
 * promised `Record<string, string>` and delivered whatever the file held, so a
 * single `null` reached `.includes()` and killed the whole scan.
 */
function stringEntries(
  value: unknown,
): { values: Record<string, string>; dropped: number } | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const values: Record<string, string> = {};
  let dropped = 0;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "string") {
      values[key] = entry;
    } else {
      dropped += 1;
    }
  }
  return { values, dropped };
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
  config: AgentscanConfig,
  opts?: { includeGlobal?: boolean },
): Facts {
  const includeGlobal = opts?.includeGlobal ?? config.includeGlobal;
  const packageErrors: ConfigErrorFact[] = [];
  const pkg = readPackageJson(root, packageErrors);
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
    lockedSkills: surface.lockedSkills,
    hasSkillsLock: surface.hasSkillsLock,
    configErrors: [...packageErrors, ...surface.configErrors],
  };
}
