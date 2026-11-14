import { basename, dirname, isAbsolute, resolve, sep } from "node:path";
import { shouldCheckSkillRuntime } from "../facts/commandcode";
import { toPosix } from "../facts/paths";
import { skillsMarker } from "../facts/providers";
import type { Facts, LockedSkillFact, SkillFact } from "../facts/types";
import type { Finding } from "../findings";
import type { Thresholds } from "../config/schema";
import { make } from "./make";

/**
 * Agent Skills name: hyphen-separated segments of lowercase letters and digits,
 * 1–64 chars. The spec says "unicode lowercase alphanumeric characters", and the
 * reference validator (`skills-ref`) accepts any Unicode letter or digit as long
 * as the name equals its own lowercase form, so `résumé-builder` is valid and an
 * ASCII-only regex was a false error. See docs/spec/agent-skills.md.
 */
const AGENT_SKILLS_NAME = /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u;
const AGENT_SKILLS_NAME_MAX = 64;
const AGENT_SKILLS_DESCRIPTION_MAX = 1024;

function isValidAgentSkillsName(name: string): boolean {
  return AGENT_SKILLS_NAME.test(name) && name === name.toLowerCase();
}

/** Global skills live outside the repo; say so, or a reader cannot tell. */
function skillEvidence(skill: SkillFact, value: string): Finding["evidence"] {
  const evidence: Finding["evidence"] = [{ kind: "skill", value }];
  if (skill.source === "global") {
    evidence.push({ kind: "source", value: "global" });
  }
  return evidence;
}
function skillSubject(skill: SkillFact): string {
  return `skill:${skill.instanceId ?? skill.id}`;
}


/**
 * The skills directory that owns a skill — `<x>/.claude/skills` for
 * `<x>/.claude/skills/deploy`.
 *
 * Two checks reason about what one agent session loads at once, and a session
 * loads one such directory, not every one in the tree. Derived rather than
 * stored: discovery already puts the owning directory in `path`.
 */
function skillRoot(skill: SkillFact): string {
  return skillsMarker(skill.path)?.root ?? dirname(toPosix(skill.path));
}

export function checkSkillStructure(facts: Facts): Finding[] {
  const out: Finding[] = [];
  for (const skill of facts.skills) {
    if (!shouldCheckSkillRuntime(skill)) {
      continue;
    }
    if (skill.unreadable === true) {
      // Covers an unreadable SKILL.md and an unreadable skill directory alike.
      // config.unreadable names it; every check below would otherwise make a
      // claim about a file we never opened — "has no SKILL.md" for a directory
      // whose SKILL.md is right there, or "no frontmatter" for a valid one.
      continue;
    }

    if (!skill.hasSkillMd) {
      out.push(
        make("skill.missing-skill-md", skillSubject(skill), {
          message: `Skill directory has no SKILL.md`,
          reason:
            "Without SKILL.md the directory is not a loadable skill; it is usually a leftover or a grouping folder that inflates the inventory.",
          evidence: skillEvidence(skill, skill.path),
          suggest: `Add ${skill.path}/SKILL.md or remove the directory`,
        }),
      );
      continue;
    }

    if (skill.unparseableFrontmatter === true) {
      // config.unreadable already names the parse failure; "no name" would be
      // a guess about fields we could not read.
      continue;
    }

    const schema = skill.schemaProfile;
    if (!skill.hasFrontmatter) {
      if (schema === "agent-skills") {
        out.push(
          make("agent-skills.skill.missing-frontmatter", skillSubject(skill), {
            message: "SKILL.md has no YAML frontmatter block",
            reason:
              "The Agent Skills spec requires YAML frontmatter with name and description. See docs/spec/agent-skills.md.",
            evidence: skillEvidence(skill, `${skill.path}/SKILL.md`),
            suggest: "Add a --- delimited block with name and description",
          }),
        );
      } else if (schema === "grok") {
        out.push(
          make("grok.skill.missing-frontmatter", skillSubject(skill), {
            message: "SKILL.md has no YAML frontmatter block",
            reason:
              "Grok Build says SKILL.md starts with YAML frontmatter. Extra keys are ignored; name and description are optional. See docs/spec/grok-skills.md.",
            evidence: skillEvidence(skill, `${skill.path}/SKILL.md`),
            suggest: "Add a --- delimited frontmatter block",
          }),
        );
      } else {
        out.push(
          make("claude.skill.missing-frontmatter", skillSubject(skill), {
            message: "SKILL.md has no YAML frontmatter block",
            reason:
              "Skill discovery reads `name` and `description` from frontmatter; without it the skill cannot be matched to a task.",
            evidence: skillEvidence(skill, `${skill.path}/SKILL.md`),
            suggest: "Add a --- delimited block with name and description",
          }),
        );
      }
      continue;
    }

    const broken = skill.brokenReferences;
    if (broken !== undefined && broken.length > 0) {
      const shown = broken.slice(0, 3).join(", ");
      const rest = broken.length - Math.min(3, broken.length);
      out.push(
        make("skill.broken-reference", skillSubject(skill), {
          message: `SKILL.md points at ${broken.length} file${broken.length === 1 ? "" : "s"} that do not exist: ${shown}${rest > 0 ? ` (+${rest} more)` : ""}`,
          reason:
            "The skill tells the agent to read a bundled file that is not there. The agent follows the pointer, finds nothing, and the skill quietly does less than it says — the same failure as a hook whose script is missing.",
          evidence: [
            ...skillEvidence(skill, skill.path),
            ...broken.map((r) => ({ kind: "missing" as const, value: r })),
          ],
          suggest: `Restore the missing files under ${skill.path}, or drop the references from SKILL.md`,
        }),
      );
    }

    if (schema === "agent-skills") {
      out.push(...checkAgentSkillsFrontmatter(skill));
    } else if (schema === "grok") {
      // name / description optional (directory / first-paragraph fallback).
    } else if (skill.description === undefined && skill.firstNonEmptyLine === undefined) {
      out.push(
        make("claude.skill.missing-description", skillSubject(skill), {
          message: "SKILL.md frontmatter has no `description` and no first non-empty markdown line",
          reason:
            "The description is what Claude matches against when deciding to load a skill automatically. If it is omitted, Claude uses the first non-empty markdown line. Without either, the skill still works when invoked directly, but it will not be picked up on its own. The spec marks description Recommended, not required — see docs/spec/skills.md.",
          evidence: skillEvidence(skill, `${skill.path}/SKILL.md`),
          suggest: "Add a one-line description to the frontmatter, or a first non-empty markdown line",
        }),
      );
    }
  }
  return out;
}

function checkAgentSkillsFrontmatter(skill: SkillFact): Finding[] {
  const out: Finding[] = [];
  const dirName = basename(toPosix(skill.path));
  // Antigravity documents `name` as optional, defaulting to the folder name.
  if (skill.frontmatterName === undefined && skill.sourceProvider !== "antigravity") {
    const typeNote =
      skill.nameKind !== undefined && skill.nameKind !== "string"
        ? ` (found ${skill.nameKind}, not a string)`
        : "";
    out.push(
      make("agent-skills.skill.missing-name", skillSubject(skill), {
        message: `SKILL.md frontmatter has no string \`name\`${typeNote}`,
        reason:
          "The Agent Skills spec requires `name` as a string and it must match the parent directory. See docs/spec/agent-skills.md.",
        evidence: skillEvidence(skill, `${skill.path}/SKILL.md`),
        suggest: `Add name: ${dirName}`,
      }),
    );
  } else if (skill.frontmatterName !== undefined) {
    const name = skill.frontmatterName;
    if (name.length > AGENT_SKILLS_NAME_MAX) {
      out.push(
        make("agent-skills.skill.name-too-long", skillSubject(skill), {
          message: `Skill name is ${name.length} characters (max ${AGENT_SKILLS_NAME_MAX})`,
          reason: "The Agent Skills spec limits `name` to 64 characters. See docs/spec/agent-skills.md.",
          evidence: skillEvidence(skill, `${skill.path}/SKILL.md`),
          suggest: "Shorten the frontmatter name",
        }),
      );
    } else if (!isValidAgentSkillsName(name) && skill.sourceProvider !== "qwen") {
      // Qwen allows `/^[\p{L}\p{N}_:.-]+$/u`, a superset; see docs/spec/qwen-skills.md.
      out.push(
        make("agent-skills.skill.invalid-name", skillSubject(skill), {
          message: `Skill name "${name}" is not a valid Agent Skills identifier`,
          reason:
            "Name must be lowercase letters (any script), numbers, and hyphens, without a leading or trailing hyphen or consecutive hyphens. See docs/spec/agent-skills.md.",
          evidence: skillEvidence(skill, `${skill.path}/SKILL.md`),
          suggest: "Use a lowercase hyphenated name that matches the directory",
        }),
      );
    }
    // Neither Qwen nor Factory documents a name-directory match (docs/spec/{qwen,factory}-skills.md).
    if (name !== dirName && skill.sourceProvider !== "junie" && skill.sourceProvider !== "qwen" && skill.sourceProvider !== "factory") {
      out.push(
        make("agent-skills.skill.name-does-not-match-directory", skillSubject(skill), {
          message: `Skill name "${name}" does not match directory "${dirName}"`,
          reason:
            "The Agent Skills spec requires `name` to match the parent directory. See docs/spec/agent-skills.md.",
          evidence: skillEvidence(skill, `${skill.path}/SKILL.md`),
          suggest: `Set name: ${dirName} or rename the directory`,
        }),
      );
    }
  }

  if (skill.description === undefined) {
    if (skill.sourceProvider !== "junie") {
      const typeNote =
        skill.descriptionKind !== undefined && skill.descriptionKind !== "string"
          ? ` (found ${skill.descriptionKind}, not a string)`
          : "";
      out.push(
        make("agent-skills.skill.missing-description", skillSubject(skill), {
          message: `SKILL.md frontmatter has no string \`description\`${typeNote}`,
          reason:
            "The Agent Skills spec requires `description` as a string (1–1024 characters). See docs/spec/agent-skills.md.",
          evidence: skillEvidence(skill, `${skill.path}/SKILL.md`),
          suggest: "Add a description that says what the skill does and when to use it",
        }),
      );
    }
  } else if (skill.description.length > AGENT_SKILLS_DESCRIPTION_MAX) {
    out.push(
      make("agent-skills.skill.description-too-long", skillSubject(skill), {
        message: `Skill description is ${skill.description.length} characters (max ${AGENT_SKILLS_DESCRIPTION_MAX})`,
        reason: "The Agent Skills spec limits `description` to 1024 characters. See docs/spec/agent-skills.md.",
        evidence: skillEvidence(skill, `${skill.path}/SKILL.md`),
        suggest: "Shorten the description",
      }),
    );
  }

  if (skill.compatibilityInvalid === true) {
    const lengthNote =
      skill.compatibility !== undefined
        ? ` (${skill.compatibility.length} characters)`
        : skill.compatibilityKind !== undefined && skill.compatibilityKind !== "string"
          ? ` (found ${skill.compatibilityKind}, not a string)`
          : "";
    out.push(
      make("agent-skills.skill.invalid-compatibility", skillSubject(skill), {
        message: `Skill compatibility is not a 1–500 character string${lengthNote}`,
        reason:
          "The Agent Skills spec constrains optional `compatibility` to a string of 1–500 characters when present. See docs/spec/agent-skills.md.",
        evidence: skillEvidence(skill, `${skill.path}/SKILL.md`),
        suggest: "Set compatibility to a 1–500 character string, or omit it",
      }),
    );
  }

  if (skill.metadataInvalid === true) {
    out.push(
      make("agent-skills.skill.invalid-metadata", skillSubject(skill), {
        message: "Skill metadata is not a map of string to string",
        reason:
          "The Agent Skills spec constrains optional `metadata` to map<string, string> when present. See docs/spec/agent-skills.md.",
        evidence: skillEvidence(skill, `${skill.path}/SKILL.md`),
        suggest: "Use a YAML mapping whose values are all strings, or omit metadata",
      }),
    );
  }

  if (skill.allowedToolsInvalid === true) {
    const typeNote =
      skill.allowedToolsKind !== undefined && skill.allowedToolsKind !== "string"
        ? ` (found ${skill.allowedToolsKind}, not a string)`
        : "";
    out.push(
      make("agent-skills.skill.invalid-allowed-tools", skillSubject(skill), {
        message: `Skill allowed-tools is not a string${typeNote}`,
        reason:
          "The Agent Skills spec constrains optional `allowed-tools` to a string when present. See docs/spec/agent-skills.md.",
        evidence: skillEvidence(skill, `${skill.path}/SKILL.md`),
        suggest: "Set allowed-tools to a space-separated string, or omit it",
      }),
    );
  }

  if (skill.bodyLines !== undefined && skill.bodyLines > 500) {
    out.push(
      make("agent-skills.skill.body-too-large", skillSubject(skill), {
        message: `SKILL.md is ${skill.bodyLines} lines (recommendation: under 500)`,
        reason:
          "The Agent Skills spec recommends keeping the main SKILL.md under 500 lines. This is a recommendation, not a load failure. See docs/spec/agent-skills.md.",
        evidence: [
          ...skillEvidence(skill, `${skill.path}/SKILL.md`),
          { kind: "count", value: `lines=${skill.bodyLines}` },
        ],
        suggest: "Move detail into bundled reference files under the skill directory",
      }),
    );
  }
  return out;
}

function skillAbs(skill: SkillFact, facts: Facts): string {
  return isAbsolute(skill.path) ? resolve(skill.path) : resolve(facts.root, skill.path);
}


function underRoot(absPath: string, root: string): boolean {
  return absPath === root || absPath.startsWith(`${root}${sep}`);
}

/** Nearest lock directory that is an ancestor of the skill path. */
function governingLockRoot(skillPath: string, lockRoots: string[]): string | undefined {
  const owners = lockRoots.filter((root) => underRoot(skillPath, root));
  if (owners.length === 0) {
    return undefined;
  }
  return owners.reduce((nearest, root) => (root.length > nearest.length ? root : nearest));
}

export function checkLockIntegrity(facts: Facts, requireLock: boolean): Finding[] {
  const out: Finding[] = [];
  // A project lockfile cannot pin a skill that lives in the user's home
  // directory, so judging global skills against it can only produce findings
  // that are never true.
  const projectSkills = facts.skills.filter(
    (s) => s.source === "project" && s.hasSkillMd,
  );

  if (!facts.hasSkillsLock) {
    if (requireLock && projectSkills.length > 0) {
      out.push(
        make("skill.no-lockfile", "skills:unpinned", {
          message: `${projectSkills.length} skill${projectSkills.length === 1 ? "" : "s"} installed with no skills-lock.json`,
          reason:
            "Without a lockfile there is no record of where each skill came from or which version is pinned, so nothing can tell a managed install from a local edit.",
          evidence: [{ kind: "count", value: `skills=${projectSkills.length}` }],
          suggest: "Manage skills with a tool that writes skills-lock.json",
        }),
      );
    }
    return out;
  }

  if (facts.skillsLockInvalid === true) {
    return out;
  }

  const lockRoots = facts.skillLockRoots.map((root) => resolve(root));
  const byRoot = new Map<string, LockedSkillFact[]>();
  for (const entry of facts.lockedSkills) {
    const root = resolve(entry.lockRoot ?? facts.root);
    const bucket = byRoot.get(root);
    if (bucket === undefined) {
      byRoot.set(root, [entry]);
    } else {
      bucket.push(entry);
    }
  }

  for (const skill of projectSkills) {
    const gov = governingLockRoot(skillAbs(skill, facts), lockRoots);
    if (gov === undefined) {
      // No lockfile owns this skill — do not compare it to a distant lock.
      continue;
    }
    const locked = new Map((byRoot.get(gov) ?? []).map((entry) => [entry.id, entry]));
    if (locked.has(skill.id)) {
      continue;
    }
    out.push(
      make("skill.not-in-lock", skillSubject(skill), {
        message: "Skill is not in skills-lock.json — local and unpinned",
        reason:
          "Every other skill here is a managed install pinned to an upstream source. This one is not tracked, so it will not be updated and cannot be reproduced on another machine.",
        evidence: skillEvidence(skill, skill.path),
        suggest:
          "Keep it if it is intentionally project-local, otherwise install it through the skills tool so it gets pinned",
      }),
    );
  }

  const multipleLocks = lockRoots.length > 1;
  for (const [root, entries] of byRoot) {
    const inScope = projectSkills.filter(
      (skill) => governingLockRoot(skillAbs(skill, facts), lockRoots) === root,
    );
    const onDisk = new Set(inScope.map((skill) => skill.id));
    for (const entry of entries) {
      if (onDisk.has(entry.id) || entry.installedBesideLock === true) {
        continue;
      }
      const from = entry.source === undefined ? "" : ` (from ${entry.source})`;
      const subject = multipleLocks && entry.lockPath !== undefined
        ? `skill:${entry.id}@${entry.lockPath}`
        : `skill:${entry.id}`;
      out.push(
        make("skill.locked-not-installed", subject, {
          action: "add",
          message: `skills-lock.json pins "${entry.id}"${from} but it is not installed`,
          reason:
            "The lockfile and the working tree disagree: either the install was removed without updating the lock, or the install never completed.",
          evidence: [
            { kind: "lock", value: entry.id },
            ...(entry.source === undefined
              ? []
              : [{ kind: "source" as const, value: entry.source }]),
            ...(entry.lockPath === undefined
              ? []
              : [{ kind: "lockfile" as const, value: entry.lockPath }]),
          ],
          suggest: "Reinstall the skill, or drop the entry from skills-lock.json",
        }),
      );
    }
  }

  return out;
}

/**
 * Skills an agent cannot choose between.
 *
 * Claude picks a skill by reading its description. Two skills carrying the same
 * one are indistinguishable at selection time: whichever is seen first wins and
 * the other is dead weight that still costs context on every routing decision.
 *
 * Exact match after normalising whitespace and case — no similarity metric.
 * A threshold needs tuning against real data, and an untuned threshold ships
 * false positives into a report whose whole value is that everything in it is
 * real. If exact matching proves too narrow, that is a finding to report, not a
 * reason to guess.
 *
 * Project skills only: a collision between two global skills is not this
 * project's to reconcile, the same scoping as the description budget.
 */
export function checkDuplicateDescriptions(facts: Facts): Finding[] {
  const groups = new Map<string, string[]>();
  for (const skill of facts.skills) {
    if (skill.source !== "project" || skill.description === undefined) {
      continue;
    }
    // Group by owning directory: nested discovery flattens every `.claude/skills`
    // in a monorepo, but no single session loads skills from two of them.
    const key = `${skillRoot(skill)}\0${skill.description.trim().replace(/\s+/g, " ").toLowerCase()}`;
    const ids = groups.get(key);
    if (ids === undefined) groups.set(key, [skill.instanceId ?? skill.id]);
    else ids.push(skill.instanceId ?? skill.id);
  }

  const out: Finding[] = [];
  for (const ids of groups.values()) {
    if (ids.length < 2) {
      continue;
    }
    // Code-point sort, not localeCompare: ICU collation differs by locale, so
    // an id copied from CI must still resolve locally.
    const sorted = [...ids].sort();
    out.push(
      // A space cannot appear in a directory name; `+` can, and `{a+b, c}` and
      // `{a, b+c}` produced one id.
      make("skill.duplicate-description", `skills:${sorted.join(" ")}`, {
        message: `${sorted.length} skills share one description: ${sorted.join(", ")}`,
        reason:
          "Claude routes on the description. When two are identical the choice between those skills is arbitrary, and the one that loses is inert while still costing context every time.",
        evidence: sorted.map((id) => ({ kind: "skill", value: id })),
        suggest:
          "Give each a description that says when to pick it over the other, or delete the redundant one",
      }),
    );
  }
  return out.sort((a, b) => (a.subject < b.subject ? -1 : 1));
}

/**
 * Claude loads each skill's description (or first non-empty markdown line) plus
 * `when_to_use` into a listing budget of 1% of the model context window.
 * When the window is unknown the fallback is 8000 characters. Each entry is
 * truncated at 1536 characters. Not applied to Agent Skills (those cap a
 * single description at 1024). See docs/spec/thresholds.md.
 */
export function checkDescriptionBudget(
  facts: Facts,
  thresholds: Thresholds,
): Finding[] {
  const ceiling = thresholds.skillListingChars;
  const perEntryCap = thresholds.skillListingMaxDescChars;
  const project = facts.skills.filter(
    (s) =>
      s.source === "project" &&
      s.hasSkillMd &&
      s.schemaProfile !== "agent-skills" &&
      s.schemaProfile !== "grok" &&
      listingText(s).length > 0,
  );
  const byRoot = new Map<string, SkillFact[]>();
  for (const s of project) {
    const root = skillRoot(s);
    const bucket = byRoot.get(root);
    if (bucket === undefined) byRoot.set(root, [s]);
    else bucket.push(s);
  }

  const out: Finding[] = [];
  for (const [root, skills] of byRoot) {
    const chars = skills.reduce(
      (sum, s) => sum + Math.min(listingText(s).length, perEntryCap),
      0,
    );
    if (chars <= ceiling) {
      continue;
    }
    const where = root.startsWith(`${facts.root}/`)
      ? root.slice(facts.root.length + 1)
      : root;
    const subject =
      byRoot.size === 1
        ? "skills:description-budget"
        : `skills:description-budget:${where}`;
    out.push(
      make("skill.description-budget", subject, {
        message: `Skill listing text totals ${chars} characters across ${skills.length} skills in ${where} (over ${ceiling}; per-entry cap ${perEntryCap})`,
        reason:
          "Claude loads description (or the first non-empty markdown line) plus when_to_use for every skill at listing time. That listing is 1% of the model context window, with an 8000-character fallback when the window is unknown, and each entry is truncated at 1536 characters. Past the budget, matching keywords are lost. See docs/spec/skills.md.",
        evidence: [
          { kind: "count", value: `listingChars=${chars}` },
          { kind: "threshold", value: String(ceiling) },
        ],
        suggest:
          "Shorten the longest descriptions or when_to_use fields, or remove skills this project does not use",
      }),
    );
  }
  return out;
}

function listingText(skill: SkillFact): string {
  const description = skill.description ?? skill.firstNonEmptyLine ?? "";
  const when = skill.whenToUse ?? "";
  return `${description}${when}`;
}
