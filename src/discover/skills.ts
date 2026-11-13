import { basename, dirname, join, resolve } from "node:path";
import type { Provider } from "../facts/provider";
import { isInside } from "../facts/paths";
import { providerFromSkillsDir, SKILL_DOT_DIRS, skillSchemaFor, skillsMarker } from "../facts/providers";
import type { SkillFact, SkillSchemaProfile } from "../facts/types";
import { hooksFromObject } from "./hooks";
import { NESTED_DISCOVERY_MAX_DEPTH, NESTED_DISCOVERY_SKIP } from "./shared";
import { readFrontmatter } from "./frontmatter";
import { isFile, isRealDirectory, isRecord, listDir, type ScanIO } from "./fs";

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
 * Three or more backticks or tildes, per CommonMark.
 */
const FENCE_BLOCK = /^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^[ \t]*\1[ \t]*$|(?![\s\S]))/gm;
const INLINE_CODE = /`[^`\n]*`/g;
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
 * First prose paragraph after frontmatter. Headings and blank lines are skipped.
 * Used when Claude omits `description`. See docs/spec/skills.md.
 */
export function firstMarkdownParagraph(body: string): string | undefined {
  const blocks = body.replace(/\r\n/g, "\n").trim().split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.split("\n").filter((line) => !/^#{1,6}\s/.test(line.trim()));
    const text = lines.map((line) => line.trim()).filter((line) => line.length > 0).join(" ");
    if (text.length > 0) {
      return text;
    }
  }
  return undefined;
}

/**
 * A reference resolves against the skill's own directory. Agent Skills require
 * relative paths from the skill root. Claude native skills also try the repo
 * root — that two-base rule is empirical for Claude only; see docs/spec/skills.md
 * and docs/spec/agent-skills.md.
 */
/**
 * "Route to `eas-app-stores`; its `references/native-ios.md` covers…" points
 * into the sibling skill named earlier in the same sentence, not this one.
 */
function inNamedSibling(body: string, skillDir: string, rel: string): boolean {
  const escaped = rel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Lookahead, so every backticked name before the reference is a candidate.
  const pattern = new RegExp(`\`([a-z0-9][a-z0-9-]*)\`(?=(?:(?!\\n\\s*\\n)[^.])*?\`${escaped}\`)`, "g");
  for (const match of body.matchAll(pattern)) {
    const sibling = match[1];
    if (sibling !== undefined && isFile(join(dirname(skillDir), sibling, rel))) {
      return true;
    }
  }
  return false;
}

function brokenReferences(
  body: string,
  skillDir: string,
  root: string,
  skillRootOnly: boolean,
): string[] {
  return skillReferences(body).filter((rel) => {
    if (isFile(join(skillDir, rel)) || inNamedSibling(body, skillDir, rel)) {
      return false;
    }
    if (skillRootOnly) {
      return true;
    }
    if (isFile(join(root, rel))) {
      return false;
    }
    // A global scan's root is home; the skill's own repo is the dir that holds `.claude/skills`.
    const marker = skillsMarker(skillDir)?.root;
    return marker === undefined || !isFile(join(dirname(dirname(marker)), rel));
  });
}

/**
 * Directories that actually contain SKILL.md. Intermediate grouping folders
 * (`.cursor/skills/frontend/deploy`) are not skills.
 */
function findSkillMdDirs(
  dir: string,
  io: ScanIO,
  depth = 0,
): string[] {
  const names = listDir(dir, io)?.map((entry) => entry.name);
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
    if (name.startsWith(".") || NESTED_DISCOVERY_SKIP.has(name)) {
      continue;
    }
    const child = join(dir, name);
    if (!isRealDirectory(child)) {
      continue;
    }
    out.push(...findSkillMdDirs(child, io, depth + 1));
  }
  return out;
}

function applyAgentSkillsOptionalFields(
  fact: SkillFact,
  fields: Record<string, unknown>,
): void {
  if ("compatibility" in fields) {
    const value = fields.compatibility;
    if (typeof value === "string") {
      fact.compatibility = value;
      fact.compatibilityKind = "string";
      if (value.length < 1 || value.length > 500) {
        fact.compatibilityInvalid = true;
      }
    } else {
      fact.compatibilityInvalid = true;
      if (typeof value === "number") {
        fact.compatibilityKind = "number";
      } else if (typeof value === "boolean") {
        fact.compatibilityKind = "boolean";
      } else {
        fact.compatibilityKind = "other";
      }
    }
  }
  if ("metadata" in fields) {
    const value = fields.metadata;
    if (!isRecord(value)) {
      fact.metadataInvalid = true;
    } else {
      const entries = Object.values(value as Record<string, unknown>);
      if (entries.some((entry) => typeof entry !== "string")) {
        fact.metadataInvalid = true;
      }
    }
  }
  if ("allowed-tools" in fields) {
    const value = fields["allowed-tools"];
    if (typeof value === "string") {
      fact.allowedTools = value;
      fact.allowedToolsKind = "string";
    } else {
      fact.allowedToolsInvalid = true;
      if (typeof value === "number") {
        fact.allowedToolsKind = "number";
      } else if (typeof value === "boolean") {
        fact.allowedToolsKind = "boolean";
      } else {
        fact.allowedToolsKind = "other";
      }
    }
  }
}

function skillFactFromDir(
  skillDir: string,
  source: "project" | "global",
  skillsRoot: string,
  io: ScanIO,
  root: string,
  opts: {
    hasSkillMd: boolean;
    unreadable?: boolean;
    provider?: Provider;
    profile?: SkillSchemaProfile;
  },
): SkillFact {
  // An env-relocated home (`CODEX_HOME`) has no provider marker in its path.
  const sourceProvider = opts.provider ?? providerFromSkillsDir(skillsRoot);
  const schemaProfile = opts.profile ?? skillSchemaFor(sourceProvider);
  const skillMd = join(skillDir, "SKILL.md");
  const fm = opts.hasSkillMd
    ? readFrontmatter(skillMd, io)
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
    const broken = brokenReferences(
      fm.body,
      skillDir,
      root,
      schemaProfile === "agent-skills",
    );
    if (broken.length > 0) {
      fact.brokenReferences = broken;
    }
    const paragraph = firstMarkdownParagraph(fm.body);
    if (paragraph !== undefined) {
      fact.firstMarkdownParagraph = paragraph;
    }
  }
  if (fm.lineCount !== undefined) {
    fact.bodyLines = fm.lineCount;
  }
  if (fm.description !== undefined) {
    fact.description = fm.description;
  }
  if (fm.descriptionKind !== undefined) {
    fact.descriptionKind = fm.descriptionKind;
  }
  if (fm.whenToUse !== undefined) {
    fact.whenToUse = fm.whenToUse;
  }
  if (fm.name !== undefined) {
    fact.frontmatterName = fm.name;
  }
  if (fm.nameKind !== undefined) {
    fact.nameKind = fm.nameKind;
  }
  if (schemaProfile === "agent-skills" && fm.fields !== undefined) {
    applyAgentSkillsOptionalFields(fact, fm.fields);
  }
  if (fm.hooks !== undefined) {
    const hooks = hooksFromObject(fm.hooks, skillMd, "skill", {
      project: root,
      own: skillDir,
    }, io, { sourceProvider: "claude", schemaProfile: "claude" });
    if (hooks.length > 0) {
      fact.frontmatterHooks = hooks;
    }
  }
  return fact;
}

/**
 * One directory that is itself a skill (`SKILL.md` at `skillDir`).
 * Used for a plugin-root `SKILL.md`. See docs/spec/skills.md.
 */
export function discoverSkillAtDir(
  skillDir: string,
  source: "project" | "global",
  io: ScanIO,
  root: string,
  provider: Provider,
): SkillFact | undefined {
  const skillMd = join(skillDir, "SKILL.md");
  if (!isFile(skillMd)) {
    return undefined;
  }
  return skillFactFromDir(skillDir, source, skillDir, io, root, { hasSkillMd: true, provider });
}

export function discoverSkillsInDir(
  dir: string,
  source: "project" | "global",
  io: ScanIO,
  root: string,
  provider?: Provider,
  profile?: SkillSchemaProfile,
): SkillFact[] {
  const names = listDir(dir, io, { optional: true })?.map((entry) => entry.name);
  if (names === undefined) {
    return [];
  }

  const found = findSkillMdDirs(dir, io);
  const skills = found.map((skillDir) =>
    skillFactFromDir(skillDir, source, dir, io, root, { hasSkillMd: true, provider, profile }),
  );

  for (const name of names) {
    // `.system` under ~/.codex/skills is a container holding six real skills,
    // not a skill — reporting it suggested deleting them.
    if (name.startsWith(".") || NESTED_DISCOVERY_SKIP.has(name)) {
      continue;
    }
    const child = join(dir, name);
    if (!isRealDirectory(child)) {
      continue;
    }
    if (found.some((path) => isInside(path, child))) {
      continue;
    }
    const dirReadable = listDir(child, io) !== undefined;
    skills.push(
      skillFactFromDir(child, source, dir, io, root, {
        hasSkillMd: false,
        provider,
        profile,
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


export function discoverNestedClaudeSkills(
  root: string,
  configuredRoots: Set<string>,
  io: ScanIO,
  options: NestedDiscoveryOptions = {},
): SkillFact[] {
  const out: SkillFact[] = [];
  const read = (dir: string): import("node:fs").Dirent[] | undefined => {
    options.onDirectoryRead?.();
    return listDir(dir, io, { detail: "could not read nested skill directories" });
  };
  const inspectSkillsParent = (dir: string): void => {
    const entries = read(dir);
    if (entries === undefined) return;
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name !== "skills") continue;
      const child = join(dir, entry.name);
      if (configuredRoots.has(resolve(child))) continue;
      out.push(...discoverSkillsInDir(child, "project", io, root));
    }
  };
  const walk = (dir: string, depth: number): void => {
    const entries = read(dir);
    if (entries === undefined) return;
    for (const entry of entries) {
      if (!entry.isDirectory() || NESTED_DISCOVERY_SKIP.has(entry.name)) continue;
      if (entry.name.startsWith(".") && !SKILL_DOT_DIRS.has(entry.name)) continue;
      const child = join(dir, entry.name);
      if (SKILL_DOT_DIRS.has(entry.name)) {
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
