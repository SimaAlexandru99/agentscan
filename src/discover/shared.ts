import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  AgentFact,
  ConfigErrorFact,
  HookFact,
  LockedSkillFact,
  McpFact,
  PolicyFileFact,
  RuleFact,
  SkillFact,
} from "../facts/types";

export const POLICY_CAP = 100_000;
// The body is read now, not just the frontmatter, so 8 KB truncated most real
// skills mid-document. Still capped: this reads every skill in the tree.
const SKILL_MD_CAP = 65_536;

export function readCapped(path: string, cap: number): { buf: Buffer; truncated: boolean } {
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.allocUnsafe(cap + 1);
    const bytes = readSync(fd, buf, 0, cap + 1, 0);
    return { buf: buf.subarray(0, bytes), truncated: bytes > cap };
  } finally { closeSync(fd); }
}

/**
 * Traversal bounds for every in-tree walk.
 *
 * Shared so the two walks that exist — nested skill directories and in-tree
 * plugin roots — cannot drift into disagreeing about what a project contains.
 *
 * ponytail: depth-8 cap bounds arbitrary trees; raise if deeper package roots become supported.
 */
export const NESTED_DISCOVERY_MAX_DEPTH = 8;
export const NESTED_DISCOVERY_SKIP = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "build",
  "coverage",
  "vendor",
]);

export type AgentSurface = {
  skills: SkillFact[];
  agents: AgentFact[];
  hooks: HookFact[];
  mcp: McpFact[];
  policyFiles: PolicyFileFact[];
  rules: RuleFact[];
  lockedSkills: LockedSkillFact[];
  hasSkillsLock: boolean;
  skillsLockInvalid?: boolean;
  skillLockRoots?: string[];
  configErrors: ConfigErrorFact[];
  codexProjectDocMaxBytes?: number;
};

/**
 * Paths that mean "this directory has agent config worth scanning", matching
 * what discovery already looks for. A tree with only `.claude/` and no
 * `package.json` is a real project for this tool.
 */
const AGENT_CONFIG_SIGNALS = [
  ".claude",
  ".agents",
  ".mcp.json",
  "mcp.json",
  "AGENTS.md",
  "CLAUDE.md",
  "skills-lock.json",
  ".cursor",
  ".vscode",
  ".github",
  ".codex",
  ".grok",
  ".gemini",
  ".kiro",
  ".windsurf",
  ".cline",
  ".roo",
  ".kilo",
  ".opencode",
  ".continue",
  ".junie",
  "opencode.json",
  "opencode.jsonc",
] as const;

const WORKSPACE_MARKERS = [
  "package.json",
  "pnpm-workspace.yaml",
  "lerna.json",
  "go.work",
  "Cargo.toml",
  "pyproject.toml",
] as const;

export function hasAgentConfigSignal(dir: string): boolean {
  return AGENT_CONFIG_SIGNALS.some((name) => existsSync(join(dir, name)));
}

function hasWorkspaceMarker(dir: string): boolean {
  return WORKSPACE_MARKERS.some((name) => existsSync(join(dir, name)));
}

/** Optional pin that stops walk-up before a parent Git root (fixtures, nested checkouts). */
export const SCAN_ROOT_MARKER = ".agentscan-root";

export type ScanContext = {
  requestedDir: string;
  workspaceBoundary: string | undefined;
  repositoryBoundary: string | undefined;
  /** Farthest ancestor the scan may walk. Child provider dirs do not shrink this. */
  scanBoundary: string;
  /** Display / package root. A nearer provider signal may win over a parent package.json. */
  projectRoot: string;
};

/**
 * Walk up from startDir. Prefer the nearest provider-config directory, then
 * the nearest workspace/package root, then the nearest Git root. A child
 * `.cursor` or `.claude` therefore wins as `projectRoot` over a parent
 * `package.json`, but `scanBoundary` stays at Git/workspace so parent Claude
 * or Codex files remain visible.
 */
export function resolveScanContext(startDir: string): ScanContext {
  const requestedDir = resolve(startDir);
  let dir = requestedDir;
  let nearestSignal: string | undefined;
  let nearestWorkspace: string | undefined;
  let nearestGit: string | undefined;
  let nearestPin: string | undefined;
  for (;;) {
    if (nearestPin === undefined && existsSync(join(dir, SCAN_ROOT_MARKER))) {
      nearestPin = dir;
    }
    if (nearestSignal === undefined && hasAgentConfigSignal(dir)) {
      nearestSignal = dir;
    }
    if (nearestWorkspace === undefined && hasWorkspaceMarker(dir)) {
      nearestWorkspace = dir;
    }
    if (nearestGit === undefined && existsSync(join(dir, ".git"))) {
      nearestGit = dir;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  // Prefer whichever of signal/workspace is closer to startDir. A fixture
  // with only package.json must not jump to a parent repo's `.claude`.
  const projectRoot = nearer(requestedDir, nearestSignal, nearestWorkspace) ?? nearestGit;
  if (projectRoot === undefined) {
    throw new Error(
      `No package.json or agent configuration found walking up from ${requestedDir}`,
    );
  }
  return {
    requestedDir,
    workspaceBoundary: nearestWorkspace,
    repositoryBoundary: nearestGit,
    scanBoundary: nearestPin ?? nearestGit ?? nearestWorkspace ?? nearestSignal ?? requestedDir,
    projectRoot,
  };
}

export function resolveRoot(startDir: string): string {
  return resolveScanContext(startDir).projectRoot;
}

function nearer(
  startDir: string,
  a: string | undefined,
  b: string | undefined,
): string | undefined {
  if (a === undefined) {
    return b;
  }
  if (b === undefined) {
    return a;
  }
  const start = resolve(startDir);
  return hops(start, a) <= hops(start, b) ? a : b;
}

/** Directories from startDir up through root, startDir first. */
export function ancestorDirsInclusive(startDir: string, root: string): string[] {
  const start = resolve(startDir);
  const stop = resolve(root);
  const out: string[] = [];
  let dir = start;
  for (;;) {
    out.push(dir);
    if (dir === stop) {
      break;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return out;
}

export function hopsFrom(from: string, to: string): number {
  return hops(resolve(from), resolve(to));
}

export function walkFiles(
  dir: string,
  opts: {
    maxDepth: number;
    match: (absPath: string, name: string) => boolean;
    onDirectoryRead?: () => void;
    errors?: ConfigErrorFact[];
  },
  depth = 0,
): string[] {
  let entries: import("node:fs").Dirent[];
  try {
    opts.onDirectoryRead?.();
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    opts.errors?.push({
      path: dir,
      kind: "unreadable",
      detail: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    if (NESTED_DISCOVERY_SKIP.has(entry.name)) {
      continue;
    }
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (depth >= opts.maxDepth) {
        continue;
      }
      out.push(...walkFiles(abs, opts, depth + 1));
      continue;
    }
    if (entry.isFile() && opts.match(abs, entry.name)) {
      out.push(abs);
    }
  }
  return out;
}

function hops(from: string, to: string): number {
  let dir = resolve(from);
  let n = 0;
  const target = resolve(to);
  while (dir !== target) {
    const parent = resolve(dir, "..");
    if (parent === dir) {
      return Number.POSITIVE_INFINITY;
    }
    dir = parent;
    n += 1;
  }
  return n;
}

/**
 * Read a JSON config. A malformed file is a config issue — the thing this tool
 * exists to report — so it is recorded rather than skipped.
 */
export function readJsonConfig(
  path: string,
  errors: ConfigErrorFact[],
): unknown | undefined {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    errors.push({
      path,
      kind: "unreadable",
      detail: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (err) {
    errors.push({
      path,
      kind: "invalid-json",
      detail: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

export type YamlScalarKind = "string" | "number" | "boolean" | "other";

export type Frontmatter = {
  hasFrontmatter: boolean;
  /** Everything after the closing fence. */
  body?: string;
  /** The block exists but the parser rejected it — fields are unknown, absent. */
  unparseable?: boolean;
  /** Read failed — say so rather than claiming the file has no frontmatter. */
  unreadable?: boolean;
  name?: string;
  nameKind?: YamlScalarKind;
  description?: string;
  descriptionKind?: YamlScalarKind;
  /**
   * The `hooks` mapping, unvalidated — a skill or subagent may declare hooks
   * "in the same configuration format as settings-based hooks". Handed to
   * `hooksFromObject`, which owns the shape checks.
   *
   * See docs/spec/hook-sources.md.
   */
  hooks?: unknown;
};

function yamlScalarKind(value: unknown): YamlScalarKind | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    return "string";
  }
  if (typeof value === "number") {
    return "number";
  }
  if (typeof value === "boolean") {
    return "boolean";
  }
  return "other";
}

function scalarString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Parse the `---` block with a real YAML parser.
 *
 * This was regex-based, and every fix uncovered another shape it read wrong: an
 * empty `name:` captured the following line, and folded scalars (`description: >`
 * with the text indented beneath) recorded ">" as the value. Tightening the
 * regex only converted a wrong value into a wrong "field is missing" — the file
 * is valid YAML and the description is right there. `yaml` is already a
 * dependency for the rule loader, so this costs nothing new.
 */
export function readFrontmatter(
  skillMdPath: string,
  errors: ConfigErrorFact[],
): Frontmatter {
  let text: string;
  let truncated = false;
  try {
    const result = readCapped(skillMdPath, SKILL_MD_CAP);
    truncated = result.truncated;
    text = result.buf.subarray(0, SKILL_MD_CAP).toString("utf8");
    // Several Windows editors write a BOM; without stripping it the `---` test
    // fails and a valid file is reported as having no frontmatter.
    if (text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1);
    }
    // CRLF is valid in a SKILL.md, but the closing fence is then "\r\n---" and
    // searching for "\n---" cuts inside it, leaving a stray \r that a strict
    // YAML parser rejects. Normalise before locating the fence.
    text = text.replace(/\r\n/g, "\n");
    // Record the partial read and keep going. Returning here reported a valid
    // 67 KB SKILL.md as broken config at severity error, on the strength of
    // bytes we chose not to read — the frontmatter sits in the first 300 of
    // them and parses fine. Truncation is a limit of this scan, not a defect
    // in the file, so it reports at info and the parse continues.
    if (truncated) {
      errors.push({ path: skillMdPath, kind: "truncated", detail: `file exceeds ${SKILL_MD_CAP} byte scan cap` });
    }
  } catch (err) {
    errors.push({
      path: skillMdPath,
      kind: "unreadable",
      detail: err instanceof Error ? err.message : String(err),
    });
    return { hasFrontmatter: false, unreadable: true };
  }
  if (!text.startsWith("---")) {
    return { hasFrontmatter: false };
  }
  // The closing fence is a line that is exactly `---` (YAML also allows `...`).
  // Matching a bare "\n---" prefix took a key named `---metadata` for the fence
  // and truncated the block, so a valid `description:` below it read as absent.
  const fence = /\n(?:---|\.\.\.)[ \t]*(?:\n|$)/.exec(text.slice(3));
  if (fence === null) {
    if (truncated) {
      // The block may well be well-formed past the cap; saying it has no
      // frontmatter is a claim about bytes we chose not to read.
      errors.push({
        path: skillMdPath,
        kind: "unexpected-shape",
        detail: `frontmatter not closed within the first ${SKILL_MD_CAP} bytes`,
      });
      return { hasFrontmatter: true, unparseable: true };
    }
    return { hasFrontmatter: false };
  }
  const end = 3 + fence.index;

  let block: unknown;
  try {
    block = parseYaml(text.slice(3, end)) as unknown;
  } catch (err) {
    // The block exists but the parser rejected it. Claiming "no name" here
    // would be a statement about a file we failed to read — the same false
    // message this parser was rewritten to stop producing. Say what is true:
    // the frontmatter is unparseable.
    errors.push({
      path: skillMdPath,
      kind: "unexpected-shape",
      detail: `frontmatter is not valid YAML: ${
        err instanceof Error ? err.message.split("\n")[0] : String(err)
      }`,
    });
    return { hasFrontmatter: true, unparseable: true };
  }
  if (block === null || typeof block !== "object" || Array.isArray(block)) {
    errors.push({
      path: skillMdPath,
      kind: "unexpected-shape",
      detail: "frontmatter is not a YAML mapping",
    });
    return { hasFrontmatter: true, unparseable: true };
  }

  const record = block as Record<string, unknown>;
  const out: Frontmatter = { hasFrontmatter: true, body: text.slice(end + 4) };
  const nameKind = yamlScalarKind(record.name);
  if (nameKind !== undefined) {
    out.nameKind = nameKind;
  }
  const name = scalarString(record.name);
  if (name !== undefined) {
    out.name = name;
  }
  const descriptionKind = yamlScalarKind(record.description);
  if (descriptionKind !== undefined) {
    out.descriptionKind = descriptionKind;
  }
  const description = scalarString(record.description);
  if (description !== undefined) {
    out.description = description;
  }
  if (record.hooks !== undefined) {
    out.hooks = record.hooks;
  }
  return out;
}
