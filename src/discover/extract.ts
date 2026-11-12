import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AgentscanConfig } from "../config/schema";
import type { Facts } from "../facts/types";
import { isRecord, newScanIO, readConfigFile, type ScanIO } from "./fs";
import { discoverAgentSurface } from "./index";
import type { ScanContext } from "./scan-context";

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
  io: ScanIO,
): PackageJson {
  const path = join(root, "package.json");
  const raw = readConfigFile(path, io, { optional: true });
  if (raw === undefined) {
    return {};
  }
  if (!isRecord(raw)) {
    io.errors.push({
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
      if (raw !== undefined) {
        io.errors.push({
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
      io.errors.push({
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
      io.errors.push({ path, kind: "unexpected-shape", detail: "scripts is not an object" });
    } else if (kept.dropped > 0) {
      io.errors.push({
        path,
        kind: "unexpected-shape",
        detail: `scripts: ${kept.dropped} entr${kept.dropped === 1 ? "y" : "ies"} ignored (value is not a string)`,
      });
    }
  }
  return pkg;
}

function stringEntries(
  value: unknown,
): { values: Record<string, string>; dropped: number } | undefined {
  if (!isRecord(value)) {
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

export function extractFacts(ctx: ScanContext, config: AgentscanConfig): Facts {
  const io = newScanIO();
  const pkg = readPackageJson(ctx.root, io);
  const surface = discoverAgentSurface(ctx, config, { io });
  return {
    ...surface,
    root: ctx.root,
    packageManager: inferPackageManager(ctx.root, pkg),
    dependencies: { ...(pkg.dependencies ?? {}) },
    devDependencies: { ...(pkg.devDependencies ?? {}) },
    configErrors: io.errors,
  };
}
