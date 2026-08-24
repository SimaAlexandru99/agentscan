import { dirname } from "node:path";
import type { Facts, Finding, SkillFact } from "../facts/types";
import type { CheckOptions } from "./options";
import { make } from "./make";

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
  return dirname(skill.path.replaceAll("\\", "/"));
}

export function checkSkillStructure(facts: Facts): Finding[] {
  const out: Finding[] = [];
  for (const skill of facts.skills) {
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
          action: "warn",
          severity: "warning",
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

    if (skill.runtime !== "agents" && !skill.hasFrontmatter) {
      out.push(
        make("skill.missing-frontmatter", skillSubject(skill), {
          action: "warn",
          severity: "warning",
          message: "SKILL.md has no YAML frontmatter block",
          reason:
            "Skill discovery reads `name` and `description` from frontmatter; without it the skill cannot be matched to a task.",
          evidence: skillEvidence(skill, `${skill.path}/SKILL.md`),
          suggest: "Add a --- delimited block with name and description",
        }),
      );
      continue;
    }

    const broken = skill.brokenReferences;
    if (skill.runtime !== "agents" && broken !== undefined && broken.length > 0) {
      const shown = broken.slice(0, 3).join(", ");
      const rest = broken.length - Math.min(3, broken.length);
      out.push(
        make("skill.broken-reference", skillSubject(skill), {
          action: "warn",
          severity: "warning",
          message: `SKILL.md points at ${broken.length} file${broken.length === 1 ? "" : "s"} that do not exist: ${shown}${rest > 0 ? ` (+${rest} more)` : ""}`,
          reason:
            "The skill tells the agent to read a bundled file that is not there. The agent follows the pointer, finds nothing, and the skill quietly does less than it says — the same failure as a hook whose script is missing.",
          evidence: [
            ...skillEvidence(skill, skill.path),
            ...broken.map((r) => ({ kind: "missing", value: r })),
          ],
          suggest: `Restore the missing files under ${skill.path}, or drop the references from SKILL.md`,
        }),
      );
    }

    if (skill.runtime !== "agents" && skill.description === undefined) {
      out.push(
        make("skill.missing-description", skillSubject(skill), {
          action: "warn",
          // The spec marks description "Recommended", not required — a skill
          // without one still loads when invoked by name.
          severity: "info",
          message: "SKILL.md frontmatter has no `description`",
          reason:
            "The description is what Claude matches against when deciding to load a skill automatically. Without it the skill still works when invoked directly, but it will not be picked up on its own. The spec marks it Recommended, not required — see docs/spec/skills.md.",
          evidence: skillEvidence(skill, `${skill.path}/SKILL.md`),
          suggest: "Add a one-line description to the frontmatter",
        }),
      );
    }
  }
  return out;
}

export function checkLockIntegrity(facts: Facts, options: CheckOptions): Finding[] {
  const out: Finding[] = [];
  // A project lockfile cannot pin a skill that lives in the user's home
  // directory, so judging global skills against it can only produce findings
  // that are never true.
  const projectSkills = facts.skills.filter(
    (s) => s.source === "project" && s.hasSkillMd,
  );

  if (!facts.hasSkillsLock) {
    if (options.requireLock === true && projectSkills.length > 0) {
      out.push(
        make("skill.no-lockfile", "skills:unpinned", {
          action: "warn",
          severity: "info",
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

  const onDisk = new Set(projectSkills.map((s) => s.id));
  const locked = new Map(facts.lockedSkills.map((l) => [l.id, l]));

  for (const skill of projectSkills) {
    if (locked.has(skill.id)) {
      continue;
    }
    out.push(
      make("skill.not-in-lock", skillSubject(skill), {
        action: "warn",
        severity: "info",
        message: "Skill is not in skills-lock.json — local and unpinned",
        reason:
          "Every other skill here is a managed install pinned to an upstream source. This one is not tracked, so it will not be updated and cannot be reproduced on another machine.",
        evidence: skillEvidence(skill, skill.path),
        suggest:
          "Keep it if it is intentionally project-local, otherwise install it through the skills tool so it gets pinned",
      }),
    );
  }

  for (const entry of facts.lockedSkills) {
    if (onDisk.has(entry.id)) {
      continue;
    }
    const from = entry.source === undefined ? "" : ` (from ${entry.source})`;
    out.push(
      make("skill.locked-not-installed", `skill:${entry.id}`, {
        action: "add",
        severity: "warning",
        message: `skills-lock.json pins "${entry.id}"${from} but it is not installed`,
        reason:
          "The lockfile and the working tree disagree: either the install was removed without updating the lock, or the install never completed.",
        evidence: [
          { kind: "lock", value: entry.id },
          ...(entry.source === undefined
            ? []
            : [{ kind: "source", value: entry.source }]),
        ],
        suggest: "Reinstall the skill, or drop the entry from skills-lock.json",
      }),
    );
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
    if (skill.runtime === "agents") {
      continue;
    }
    // Group by the directory that owns the skill, not by runtime convention.
    // Nested discovery flattens every `.claude/skills` under the scan root into
    // one list, so in a monorepo `app-a/.claude/skills/deploy` and
    // `app-b/.claude/skills/deploy` looked like a collision — 29 warnings on one
    // real repo, for skills no single session ever loads together.
    const key = `${skillRoot(skill)}\0${skill.description.trim().replace(/\s+/g, " ").toLowerCase()}`;
    if (key.length === 0) {
      continue;
    }
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
        action: "warn",
        severity: "warning",
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
 * Every skill's name and description is loaded at startup so Claude can decide
 * what to reach for. That sits in a character budget of roughly 1-2% of the
 * context window, shared across all of them — past it descriptions are
 * truncated and the keywords Claude matches on are lost.
 *
 * This replaced a plain skill count, which measured the wrong thing: a project
 * with 44 short-description skills sits comfortably under budget while one with
 * 53 verbose ones is over.
 *
 * Evidence and confidence: docs/spec/thresholds.md
 */
export function checkDescriptionBudget(
  facts: Facts,
  options: CheckOptions,
): Finding[] {
  const ceiling = options.skillDescriptionBytes;
  if (ceiling === undefined) {
    return [];
  }
  // Only directories that load at startup, and only their descriptions: a
  // folder with no SKILL.md contributes nothing, and the same report calls it
  // "not a loadable skill".
  const project = facts.skills.filter(
    (s) => s.source === "project" && s.hasSkillMd && s.description !== undefined,
  );
  // One budget per skills directory. The startup budget is spent by one session,
  // and a session loads one such directory — summing a monorepo's three apps
  // into a single total describes a runtime that never exists.
  const byRoot = new Map<string, SkillFact[]>();
  for (const s of project) {
    const root = skillRoot(s);
    const bucket = byRoot.get(root);
    if (bucket === undefined) byRoot.set(root, [s]);
    else bucket.push(s);
  }

  const out: Finding[] = [];
  for (const [root, skills] of byRoot) {
    // Bytes, not UTF-16 units — the threshold and docs/spec/thresholds.md are
    // both stated in bytes, and `.length` half-counts non-ASCII.
    const bytes = skills.reduce(
      (sum, s) =>
        sum + Buffer.byteLength(s.id) + Buffer.byteLength(s.description ?? ""),
      0,
    );
    if (bytes <= ceiling) {
      continue;
    }
    // A single-directory project keeps the id it has always had, so an existing
    // `ignoreFindings` entry does not silently stop matching.
    const where = root.startsWith(`${facts.root}/`)
      ? root.slice(facts.root.length + 1)
      : root;
    const subject =
      byRoot.size === 1
        ? "skills:description-budget"
        : `skills:description-budget:${where}`;
    out.push(
      make("skill.description-budget", subject, {
        action: "warn",
        severity: "info",
        message: `Skill descriptions total ${bytes} bytes across ${skills.length} skills in ${where} (over ${ceiling})`,
        reason:
          "Names and descriptions for every skill are loaded at startup, within a budget of roughly 1-2% of the context window. Past it they are truncated, and a skill whose description is cut short stops being matched for the tasks it was written for.",
        evidence: [
          { kind: "count", value: `descriptionBytes=${bytes}` },
          { kind: "threshold", value: String(ceiling) },
        ],
        suggest:
          "Shorten the longest descriptions, or remove skills this project does not use",
      }),
    );
  }
  return out;
}
