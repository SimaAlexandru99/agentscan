import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ConfigErrorFact, SkillFact } from "../facts/types";
import { readFrontmatter } from "./shared";

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

export function discoverSkillsInDir(
  dir: string,
  source: "project" | "global",
  errors: ConfigErrorFact[],
  root: string,
): SkillFact[] {
  if (!existsSync(dir)) {
    return [];
  }
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (err) {
    // An unreadable skills dir looks exactly like a project with no skills.
    errors.push({
      path: dir,
      kind: "unreadable",
      detail: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
  const skills: SkillFact[] = [];
  const normalizedDir = dir.replaceAll("\\", "/");
  const runtime: SkillFact["runtime"] = normalizedDir.includes("/.claude/skills") || normalizedDir.endsWith("/.claude/skills")
    ? "claude"
    : normalizedDir.includes("/.agents/skills") || normalizedDir.endsWith("/.agents/skills")
      ? "agents"
      : "unknown";
  for (const name of entries) {
    // `.system` under ~/.codex/skills is a container holding six real skills,
    // not a skill — reporting it suggested deleting them. Mirrors the dotfile
    // filter discoverAgents already has.
    if (name.startsWith(".") || name === "node_modules") {
      continue;
    }
    const skillDir = join(dir, name);
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(skillDir);
    } catch {
      continue;
    }
    if (!st.isDirectory()) {
      continue;
    }
    const skillMd = join(skillDir, "SKILL.md");
    // existsSync cannot tell ENOENT from EACCES, so on an unreadable directory
    // "no SKILL.md" is a claim about a file we never got to look at.
    let dirReadable = true;
    try {
      readdirSync(skillDir);
    } catch (err) {
      dirReadable = false;
      errors.push({
        path: skillDir,
        kind: "unreadable",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
    const hasSkillMd = dirReadable && existsSync(skillMd);
    const fm = hasSkillMd
      ? readFrontmatter(skillMd, errors)
      : { hasFrontmatter: false as const };

    const fact: SkillFact = {
      id: name,
      runtime,
      path: skillDir,
      source,
      hasSkillMd,
      hasFrontmatter: fm.hasFrontmatter,
    };
    if (fm.unreadable === true || !dirReadable) {
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
    if (fm.name !== undefined) {
      fact.frontmatterName = fm.name;
    }
    skills.push(fact);
  }
  return skills;
}

// ponytail: depth-8 cap bounds arbitrary trees; raise if deeper package roots become supported.
const NESTED_DISCOVERY_MAX_DEPTH = 8;
const NESTED_DISCOVERY_SKIP = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "build",
  "coverage",
  "vendor",
]);

type NestedDiscoveryOptions = {
  /** @internal test seam; deliberately not a CLI option. */
  onDirectoryRead?: () => void;
};

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
  const inspectClaude = (dir: string): void => {
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
      if (entry.name.startsWith(".") && entry.name !== ".claude") continue;
      const child = join(dir, entry.name);
      if (entry.name === ".claude") {
        // A .claude directory is a container, not another tree to recurse.
        // This also excludes .claude/worktrees snapshots by construction.
        inspectClaude(child);
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
