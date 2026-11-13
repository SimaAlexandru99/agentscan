import {
  closeSync,
  type Dirent,
  existsSync,
  lstatSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  statSync,
} from "node:fs";
import { resolve } from "node:path";
import { parse as parseToml } from "smol-toml";
import { parse as parseYaml } from "yaml";
import type { ConfigErrorFact } from "../facts/types";
import { mcpFileIsJsonc } from "../facts/provider";
import { toPosix } from "../facts/paths";
import { parseJsonc } from "./jsonc";

/**
 * The one file-IO layer for discovery: existence tests, capped text reads and
 * config parsing. A config file's format and its error policy are decided here.
 */

export function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

export function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Like `isDirectory` but a symlink is not followed, so skill walks cannot loop. */
export function isRealDirectory(path: string): boolean {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
}

function errorDetail(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** EACCES/EPERM: the scan lacks permission, the file is not broken. */
function unreadableKind(err: unknown): "unreadable" | "permission-denied" {
  const code = err instanceof Error ? (err as NodeJS.ErrnoException).code : undefined;
  return code === "EACCES" || code === "EPERM" ? "permission-denied" : "unreadable";
}

function isEnoent(err: unknown): boolean {
  return err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT";
}

export type DirReadOpts = { optional?: boolean; detail?: string };

/** A parsed config value that is a plain object (not null, not an array). */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Directory entries. An unreadable directory records `unreadable` (with
 * `detail`, else the OS message) and returns undefined. `optional` is silent
 * on ENOENT only: a missing directory is "nothing here", not a config error.
 */
export function listDir(dir: string, io: ScanIO, opts: DirReadOpts = {}): Dirent[] | undefined {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if (opts.optional === true && isEnoent(err)) {
      return undefined;
    }
    io.errors.push({ path: dir, kind: unreadableKind(err), detail: opts.detail ?? errorDetail(err) });
    return undefined;
  }
}

/**
 * Read at most `cap` bytes as UTF-8. Records `unreadable` (returns undefined) or
 * `truncated` (keeps the prefix). `byteLength` is the bytes read, `cap + 1` when truncated.
 */
export function readCapped(
  path: string,
  cap: number,
  io: ScanIO,
  opts: { optional?: boolean } = {},
): { text: string; byteLength: number; truncated: boolean } | undefined {
  let buf: Buffer;
  try {
    const fd = openSync(path, "r");
    try {
      buf = Buffer.allocUnsafe(cap + 1);
      buf = buf.subarray(0, readSync(fd, buf, 0, cap + 1, 0));
    } finally {
      closeSync(fd);
    }
  } catch (err) {
    if (opts.optional === true && isEnoent(err)) {
      return undefined;
    }
    io.errors.push({ path, kind: unreadableKind(err), detail: errorDetail(err) });
    return undefined;
  }
  const truncated = buf.length > cap;
  if (truncated) {
    io.errors.push({ path, kind: "truncated", detail: `file exceeds ${cap} byte scan cap` });
  }
  return { text: buf.subarray(0, cap).toString("utf8"), byteLength: buf.length, truncated };
}

type ConfigFormat = "json" | "jsonc" | "toml" | "yaml";

function configFormat(path: string): ConfigFormat {
  const normalized = toPosix(path);
  if (/\.toml$/i.test(normalized)) return "toml";
  if (/\.ya?ml$/i.test(normalized)) return "yaml";
  if (/\.jsonc$/i.test(normalized)) return "jsonc";
  // Same path table as profile detection, so MCP and hooks agree on
  // `.gemini/settings.json`. See docs/spec/{vscode,opencode,gemini}-mcp.md.
  return mcpFileIsJsonc(normalized) ? "jsonc" : "json";
}

/**
 * Per-scan IO state: the config-error sink and the parsed-file cache. One is
 * created per `discoverAgentSurface` call and passed to every reader, so a new
 * scan (or a test) starts with an empty cache.
 */
export type ScanIO = {
  errors: ConfigErrorFact[];
  cache: Map<string, { value: unknown; shapeReported: boolean }>;
};

export function newScanIO(): ScanIO {
  return { errors: [], cache: new Map() };
}

/** Cached parse results are shared by every reader of the file, so none may mutate them. */
function deepFreeze(value: unknown): unknown {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}

/**
 * Read and parse a config file in the format its path implies. A malformed file
 * is a config issue — the thing this tool exists to report — so exactly one
 * ConfigErrorFact is recorded and undefined returned. JSON parse failures are
 * `invalid-json`; TOML/YAML parse failures are `unexpected-shape` with the
 * first message line. `optional` returns undefined silently when the path does not exist.
 * Memoized per scan by resolved path: a file read by two readers is parsed once
 * and its error recorded once. The value is deep-frozen: readers share it.
 */
export function readConfigFile(
  path: string,
  io: ScanIO,
  opts: { optional?: boolean } = {},
): unknown | undefined {
  if (opts.optional === true && !existsSync(path)) {
    return undefined;
  }
  const key = resolve(path);
  const hit = io.cache.get(key);
  if (hit !== undefined) {
    return hit.value;
  }
  const value = deepFreeze(parseConfigFile(path, io.errors));
  io.cache.set(key, { value, shapeReported: false });
  return value;
}

/**
 * Record that a file's root is not the object its readers expect — once per
 * scan, by the first reader that looks, however many readers share the file.
 */
export function reportRootShapeOnce(path: string, io: ScanIO, detail: string): void {
  const entry = io.cache.get(resolve(path));
  if (entry?.shapeReported === true) {
    return;
  }
  if (entry !== undefined) {
    entry.shapeReported = true;
  }
  io.errors.push({ path, kind: "unexpected-shape", detail });
}

function parseConfigFile(path: string, errors: ConfigErrorFact[]): unknown | undefined {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    errors.push({ path, kind: unreadableKind(err), detail: errorDetail(err) });
    return undefined;
  }
  const format = configFormat(path);
  try {
    switch (format) {
      case "json":
        return JSON.parse(text) as unknown;
      case "jsonc":
        return parseJsonc(text);
      case "toml":
        return parseToml(text);
      case "yaml":
        return parseYaml(text) as unknown;
    }
  } catch (err) {
    if (format === "json" || format === "jsonc") {
      errors.push({ path, kind: "invalid-json", detail: errorDetail(err) });
    } else {
      const detail = err instanceof Error ? err.message.split("\n")[0] ?? err.message : String(err);
      errors.push({ path, kind: "unexpected-shape", detail });
    }
    return undefined;
  }
}
