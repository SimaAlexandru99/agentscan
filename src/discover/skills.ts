import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { providerFromSkillsDir, schemaProfileFromSkillsDir } from "../facts/provider";
import type { ConfigErrorFact, SkillFact } from "../facts/types";
import { hooksFromObject } from "./hooks";
import { NESTED_DISCOVERY_MAX_DEPTH, NESTED_DISCOVERY_SKIP, readFrontmatter } from "./shared";

const BUNDLED = "scripts|references|assets|templates|examples";
const REFERENCE_RE = new RegExp(
  // `./` is an accepted prefix; anything else before the directory name means
  // the path belongs to something other than this skill.
  `(?<![\\w/.-])(?:\\./)?((?:${BUNDLED})/[A-Za-z0-9_./-]+\\.[A-Za-z0-9]{1,10})(?![A-Za-z0-9_.-])`,
  "g",
);

/**
 * Code-block fences, anchored to line start.
 *
 * Three or more backticks or tildes, per CommonMark. The previous version
 * matched an unanchored ``` anywhere, so a mid-line backtick run swallowed the
 * rest of the document and hid real references; and it knew nothing of `~~~` or
 * four-backtick fences, so examples inside those were reported as broken.
 */
const FENCE_BLOCK = /^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^[ \t]*\1[ \t]*$|$)/gm;
/** Inline code may point at a bundled file; ordinary prose remains ignored. */
const INLINE_CODE = /`[^`\n]*`/g;
/** A URL swallows any path inside it, including one in a query string. */
const URLS = /\b[a-z][a-z0-9+.-]*:\/\/\S+/gi;

/**
 * Bundled files a SKILL.md body points at.
 *
 * Conservative on purpose: a wrong "this skill points at a missing file" costs
 * the reader more than a missed one. Fenced code blocks are stripped first —
 * paths in them illustrate usage rather than pointing anywhere.
 */
export function skillReferences(body: string): string[] {
  const prose = body
    .replace(FENCE_BLOCK, "")
    .replace(INLINE_CODE, (code) => /(?:scripts|references|assets|templates|examples)\/[A-Za-z0-9_./-]+\.[A-Za-z0-9]{1,10}/.test(code) ? code : "")
    .replace(URLS, "");
  const out: string[] = [];
  const seen = new Set<string>();
  for (const match of prose.matchAll(REFERENCE_RE)) {
    const path = match[1];
    if (path === undefined || seen.has(path)) {
      continue;
    }
    seen.add(path);
    out.push(path);
  }
  return out;
}

/**
 * A reference resolves against the skill's own directory or, failing that, the
 * repo root. Both bases are needed: across 1674 references measured in real
 * projects, 1645 resolved skill-relative and 12 only at the root — checking one
 * base alone would report those 12 as broken.
 */
function brokenReferences(
  body: string,
  skillDir: string,
  root: string,
): string[] {
  // A directory named like a file satisfies existsSync but cannot be read, so
  // the reference is still dead.
  const isFile = (p: string): boolean => {
    try {
      return statSync(p).isFile();
    } catch {
      return false;
    }
  };
  return skillReferences(body).filter(
    (rel) => !isFile(join(skillDir, rel)) && !isFile(join(root, rel)),
  );
}

function readDirNames(dir: string, errors: ConfigErrorFact[]): string[] | undefined {
  try {
    return readdirSync(dir);
  } catch (err) {
    errors.push({
      path: dir,
      kind: "unreadable",
      detail: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * Directories that actually contain SKILL.md. Intermediate grouping folders
 * (`.cursor/skills/frontend/deploy`) are not skills.
 */
function findSkillMdDirs(
  dir: string,
  errors: ConfigErrorFact[],
  depth = 0,
): string[] {
  const names = readDirNames(dir, errors);
  if (names === undefined) {
    return [];
  }
  if (isFile(join(dir, "SKILL.md"))) {
    return [dir];
  }
  if (depth >= NESTED_DISCOVERY_MAX_DEPTH) {
    return [];
  }
  const out: string[] = [];
  for (const name of names) {
    if (name.startsWith(".") || name === "node_modules" || NESTED_DISCOVERY_SKIP.has(name)) {
      continue;
    }
    const child = join(dir, name);
    if (!isDirectory(child)) {
      continue;
    }
    out.push(...findSkillMdDirs(child, errors, depth + 1));
  }
  return out;
}

function skillFactFromDir(
  skillDir: string,
  source: "project" | "global",
  skillsRoot: string,
  errors: ConfigErrorFact[],
  root: string,
  opts: { hasSkillMd: boolean; unreadable?: boolean },
): SkillFact {
  const normalizedRoot = skillsRoot.replaceAll("\\", "/");
  const sourceProvider = providerFromSkillsDir(normalizedRoot);
  const schemaProfile = schemaProfileFromSkillsDir(normalizedRoot);
  const skillMd = join(skillDir, "SKILL.md");
  const fm = opts.hasSkillMd
    ? readFrontmatter(skillMd, errors)
    : { hasFrontmatter: false as const };
  const fact: SkillFact = {
    id: basename(skillDir),
    sourceProvider,
    schemaProfile,
    path: skillDir,
    source,
    hasSkillMd: opts.hasSkillMd,
    hasFrontmatter: fm.hasFrontmatter,
  };
  if (opts.unreadable === true || fm.unreadable === true) {
    fact.unreadable = true;
  }
  if (fm.unparseable === true) {
    fact.unparseableFrontmatter = true;
  }
  if (fm.body !== undefined) {
    const broken = brokenReferences(fm.body, skillDir, root);
    if (broken.length > 0) {
      fact.brokenReferences = broken;
    }
  }
  if (fm.description !== undefined) {
    fact.description = fm.description;
  }
  if (fm.descriptionKind !== undefined) {
    fact.descriptionKind = fm.descriptionKind;
  }
  if (fm.name !== undefined) {
    fact.frontmatterName = fm.name;
  }
  if (fm.nameKind !== undefined) {
    fact.nameKind = fm.nameKind;
  }
  if (fm.hooks !== undefined) {
    const hooks = hooksFromObject(fm.hooks, skillMd, "skill", {
      project: root,
      own: skillDir,
    }, errors);
    if (hooks.length > 0) {
      fact.frontmatterHooks = hooks;
    }
  }
  return fact;
}

export function discoverSkillsInDir(
  dir: string,
  source: "project" | "global",
  errors: ConfigErrorFact[],
  root: string,
): SkillFact[] {
  if (!existsSync(dir)) {
    return [];
  }
  const names = readDirNames(dir, errors);
  if (names === undefined) {
    return [];
  }

  const found = findSkillMdDirs(dir, errors);
  const foundSet = new Set(found.map((path) => resolve(path)));
  const skills = found.map((skillDir) =>
    skillFactFromDir(skillDir, source, dir, errors, root, { hasSkillMd: true }),
  );

  for (const name of names) {
    // `.system` under ~/.codex/skills is a container holding six real skills,
    // not a skill — reporting it suggested deleting them.
    if (name.startsWith(".") || name === "node_modules") {
      continue;
    }
    const child = join(dir, name);
    if (!isDirectory(child)) {
      continue;
    }
    const resolved = resolve(child);
    if (foundSet.has(resolved) || found.some((path) => resolve(path).startsWith(`${resolved}/`))) {
      continue;
    }
    let dirReadable = true;
    try {
      readdirSync(child);
    } catch (err) {
      dirReadable = false;
      errors.push({
        path: child,
        kind: "unreadable",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
    skills.push(
      skillFactFromDir(child, source, dir, errors, root, {
        hasSkillMd: false,
        ...(dirReadable ? {} : { unreadable: true }),
      }),
    );
  }
  return skills;
}

type NestedDiscoveryOptions = {
  /** @internal test seam; deliberately not a CLI option. */
  onDirectoryRead?: () => void;
};

const NESTED_SKILL_PARENTS = new Set([".claude", ".cursor", ".agents", ".codex", ".commandcode"]);

export function discoverNestedClaudeSkills(
  root: string,
  configuredRoots: Set<string>,
  errors: ConfigErrorFact[],
  options: NestedDiscoveryOptions = {},
): SkillFact[] {
  const out: SkillFact[] = [];
  const read = (dir: string): import("node:fs").Dirent[] | undefined => {
    options.onDirectoryRead?.();
    try {
      return readdirSync(dir, { withFileTypes: true });
    } catch {
      errors.push({ path: dir, kind: "unreadable", detail: "could not read nested skill directories" });
      return undefined;
    }
  };
  const inspectSkillsParent = (dir: string): void => {
    const entries = read(dir);
    if (entries === undefined) return;
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name !== "skills") continue;
      const child = join(dir, entry.name);
      if (configuredRoots.has(resolve(child))) continue;
      out.push(...discoverSkillsInDir(child, "project", errors, root));
    }
  };
  const walk = (dir: string, depth: number): void => {
    const entries = read(dir);
    if (entries === undefined) return;
    for (const entry of entries) {
      if (!entry.isDirectory() || NESTED_DISCOVERY_SKIP.has(entry.name)) continue;
      if (entry.name.startsWith(".") && !NESTED_SKILL_PARENTS.has(entry.name)) continue;
      const child = join(dir, entry.name);
      if (NESTED_SKILL_PARENTS.has(entry.name)) {
        // A provider directory is a container, not another tree to recurse.
        // This also excludes .claude/worktrees snapshots by construction.
        inspectSkillsParent(child);
        continue;
      }
      if (depth >= NESTED_DISCOVERY_MAX_DEPTH) continue;
      walk(child, depth + 1);
    }
  };
  walk(root, 0);
  return out;
}

/**
 * Keep every path. Qualify only colliding ids so findings and lock checks stay distinct.
 */
export function disambiguateSkills(skills: SkillFact[], root: string): SkillFact[] {
  const counts = new Map<string, number>();
  for (const skill of skills) counts.set(skill.id, (counts.get(skill.id) ?? 0) + 1);
  return skills.map((skill) => {
    if ((counts.get(skill.id) ?? 0) < 2) return skill;
    const location = skill.source === "project"
      ? skill.path.slice(root.length + 1)
      : `global:${skill.path}`;
    return { ...skill, instanceId: `${skill.id}@${location}` };
  });
}
