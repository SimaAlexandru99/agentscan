import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentscanConfig } from "../config/schema";
import { discoverAgentSurface } from "../discover/index";
import type { ConfigErrorFact, Facts } from "./types";

type PackageJson = {
  packageManager?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
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
  for (const field of ["dependencies", "devDependencies"] as const) {
    const raw = obj[field];
    const kept = stringEntries(raw);
    if (kept === undefined) {
      // Present but not an object — `"dependencies": "notanobject"` would
      // otherwise be reported as a project with zero dependencies.
      if (raw !== undefined) {
        errors.push({
          path,
          kind: "unexpected-shape",
          detail: `${field} is not an object`,
        });
      }
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
  const scripts = obj.scripts;
  if (scripts !== undefined) {
    const kept = stringEntries(scripts);
    if (kept === undefined) {
      errors.push({ path, kind: "unexpected-shape", detail: "scripts is not an object" });
    } else if (kept.dropped > 0) {
      errors.push({
        path,
        kind: "unexpected-shape",
        detail: `scripts: ${kept.dropped} entr${kept.dropped === 1 ? "y" : "ies"} ignored (value is not a string)`,
      });
    }
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

/**
 * Build immutable Facts snapshot from package.json + discovered agent surface.
 * No network. No disk writes.
 */
export function extractFacts(
  root: string,
  config: AgentscanConfig,
  opts?: { includeGlobal?: boolean; startDir?: string; scanBoundary?: string },
): Facts {
  const includeGlobal = opts?.includeGlobal ?? config.includeGlobal;
  const startDir = opts?.startDir ?? root;
  const scanBoundary = opts?.scanBoundary ?? root;
  const packageErrors: ConfigErrorFact[] = [];
  const pkg = readPackageJson(root, packageErrors);
  const dependencies = { ...(pkg.dependencies ?? {}) };
  const devDependencies = { ...(pkg.devDependencies ?? {}) };

  const surface = discoverAgentSurface(root, config, {
    includeGlobal,
    startDir,
    scanBoundary,
  });

  return {
    root,
    startDir,
    scanBoundary,
    packageManager: inferPackageManager(root, pkg),
    dependencies,
    devDependencies,
    skills: surface.skills,
    agents: surface.agents,
    hooks: surface.hooks,
    mcp: surface.mcp,
    policyFiles: surface.policyFiles,
    rules: surface.rules,
    slashCommands: surface.slashCommands,
    mods: surface.mods,
    ...(surface.commandcodeModel === undefined
      ? {}
      : {
          commandcodeModel: surface.commandcodeModel,
          commandcodeModelSource: surface.commandcodeModelSource,
        }),
    lockedSkills: surface.lockedSkills,
    hasSkillsLock: surface.hasSkillsLock,
    skillsLockInvalid: surface.skillsLockInvalid,
    ...(surface.skillLockRoots === undefined ? {} : { skillLockRoots: surface.skillLockRoots }),
    configErrors: [...packageErrors, ...surface.configErrors],
    ...(surface.codexProjectDocMaxBytes === undefined
      ? {}
      : { codexProjectDocMaxBytes: surface.codexProjectDocMaxBytes }),
  };
}
