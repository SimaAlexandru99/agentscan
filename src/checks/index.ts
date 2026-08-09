import { basename } from "node:path";
import type { Facts, Finding, SkillFact } from "../facts/types";
import { runBudgets } from "./budgets";
import { make } from "./make";

/**
 * Structural config checks.
 *
 * Every assumption these encode about how agent configuration works is recorded
 * in docs/spec/, with the URL it came from and the date. Two checks written from
 * observation instead — a nine-name hook-event list where the spec has 31, and a
 * "frontmatter name must equal the directory" rule the spec contradicts —
 * produced 25 of the 37 findings this tool reported across 17 projects. Before
 * adding a check, find the spec line and record it there.
 *
 * Each check here validates one discovered item against its own file on disk.
 * The aggregate size judgements — how long AGENTS.md is, how many MCP servers
 * there are — live in budgets.ts, which runs from the same entry point and is
 * declared in the same list.
 */

export type CheckOptions = {
  /** Flag a project that has skills but no skills-lock.json. Off by default. */
  requireLock?: boolean;
  /** Byte ceiling for all skill names + descriptions loaded at startup. */
  skillDescriptionBytes?: number;
  /** Budget ceilings. Absent means "do not run the budget checks at all". */
  budgets?: {
    agentsMdLines: number;
    claudeMdLines: number;
    agents: number;
    mcp: number;
  };
};

/**
 * Every id `runChecks` can emit — the whole of what this tool can report, and
 * what `agentscan rules` prints. Keep in sync with the functions below and in
 * budgets.ts; the `declared ids and emitted ids are the same set` test fails in
 * both directions if they drift.
 */
export const STRUCTURAL_CHECKS: { id: string; description: string }[] = [
  {
    id: "config.unreadable",
    description: "Config file is not valid JSON or cannot be read",
  },
  {
    id: "hook.unknown-event",
    description: "Hook registered under an event name that is never dispatched",
  },
  {
    id: "hook.missing-script",
    description: "Hook points at a script that does not exist, so it never runs",
  },
  {
    id: "skill.missing-skill-md",
    description: "Skill directory has no SKILL.md",
  },
  {
    id: "skill.missing-frontmatter",
    description: "SKILL.md has no YAML frontmatter block",
  },
  {
    id: "skill.missing-description",
    description: "SKILL.md frontmatter has no description (recommended field)",
  },
  {
    id: "skill.not-in-lock",
    description: "Skill on disk is not tracked by skills-lock.json",
  },
  {
    id: "skill.locked-not-installed",
    description: "skills-lock.json pins a skill that is not installed",
  },
  {
    id: "skill.broken-reference",
    description: "SKILL.md points at a bundled file that does not exist",
  },
  {
    id: "skill.duplicate-description",
    description: "Two or more skills share an identical description",
  },
  {
    id: "skill.description-budget",
    description: "Skill descriptions exceed the startup character budget",
  },
  {
    id: "skill.no-lockfile",
    description: "Skills present with no skills-lock.json (requireLock only)",
  },
  {
    id: "agent.missing-frontmatter",
    description: "Agent definition has no YAML frontmatter block",
  },
  {
    id: "agent.missing-description",
    description: "Agent frontmatter has no description",
  },
  {
    id: "mcp.no-launch",
    description: "MCP server declares neither command nor url",
  },
  {
    id: "mcp.url-without-type",
    description: "Remote MCP server has a url but no transport type",
  },
  {
    id: "mcp.hardcoded-secret",
    description: "MCP config contains a token-shaped literal",
  },
  {
    id: "mcp.literal-env",
    description: "MCP env value is a long literal instead of ${VAR}",
  },
  // Budgets — see budgets.ts. Size judgements, all info, never build-failing.
  {
    id: "budget.agents-md",
    description:
      "AGENTS.md longer than the point where added lines stop helping (>150 lines)",
  },
  {
    id: "budget.claude-md",
    description:
      "CLAUDE.md longer than the instruction budget a model reliably follows (>200 lines)",
  },
  {
    id: "budget.agents",
    description:
      "More agent definitions than a focused set (>8 files in .claude/agents)",
  },
  {
    id: "budget.mcp",
    description:
      "Project MCP server count above the point where tool selection degrades",
  },
  {
    id: "policy.package-manager-drift",
    description: "Policy mentions npm install while packageManager is bun",
  },
];

/**
 * Token shapes worth failing a build over. Deliberately narrow — no entropy
 * guessing.
 *
 * ORDER IS SIGNIFICANT: the caller uses `.find()`, so a more specific prefix
 * must come before any pattern that also matches it. `sk-ant-` is a subset of
 * `sk-`, and reporting the wrong provider on a "rotate this key" finding sends
 * the user to the wrong dashboard.
 */
const SECRET_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "Anthropic key", re: /\bsk-ant-[A-Za-z0-9_-]{16,}/ },
  // No embedded hyphens after the prefix. `sk-mcp-server-toolkit` is a package
  // name, and calling it a leaked credential at severity error is unfalsifiable
  // from the report, since the matched value is correctly never echoed.
  { label: "OpenAI-style key", re: /\bsk-[A-Za-z0-9_]{20,}\b/ },
  { label: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{20,}/ },
  { label: "Google API key", re: /\bAIza[A-Za-z0-9_-]{20,}/ },
  { label: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { label: "AWS access key id", re: /\bAKIA[0-9A-Z]{16}\b/ },
];

/**
 * Strip source text out of a parser's message.
 *
 * Parsers quote the offending fragment back — `Unexpected identifier "ghp_…"`,
 * `Unresolved alias …: ghp_…`. When the unparseable file is an MCP config or a
 * SKILL.md that fragment can be a credential, and it reached both the text
 * report and `--json`, which the README tells people to pipe into CI logs. A
 * tool whose flagship check reports hardcoded secrets must not print one.
 *
 * Only the position survives, because only the position is actionable. Redacting
 * by token shape was the alternative and is strictly worse: it catches six known
 * shapes, and a parser can quote any source at all.
 */
function safeDetail(detail: string): string {
  const position = detail.match(/\bline \d+(?:, column \d+)?/i)?.[0];
  const kind = detail.split(/[:(]/)[0]?.trim().slice(0, 60);
  const head = kind !== undefined && kind.length > 0 ? kind : "parse error";
  return position === undefined ? head : `${head} at ${position}`;
}

function checkConfigErrors(facts: Facts): Finding[] {
  return facts.configErrors.map((err) => {
    const what =
      err.kind === "invalid-json"
        ? "is not valid JSON"
        : err.kind === "unreadable"
          ? "could not be read"
          : "has an unexpected shape";
    // One file can fail several ways at once — three invalid package.json
    // fields gave three findings sharing one id, and `explain` reached only the
    // first. The kind and detail disambiguate without changing the common case.
    return make("config.unreadable", `config:${err.path}#${err.kind}:${safeDetail(err.detail)}`, {
      action: "warn",
      severity: "error",
      message: `${basename(err.path)} ${what} — its contents are invisible to the scan`,
      reason:
        "An unparseable config is silently ignored by the tools that read it, so whatever it configured is simply not in effect.",
      evidence: [
        { kind: "config", value: err.path },
        { kind: "detail", value: safeDetail(err.detail) },
      ],
      suggest: `Fix the syntax in ${err.path}`,
    });
  });
}

/**
 * Every hook event Claude Code dispatches, from the official hooks reference.
 *
 * This list started at nine names guessed from what appeared in real projects,
 * which made `hook.unknown-event` report `PostToolBatch` — a real event — as a
 * dead hook, at severity error. Twenty-two valid names were missing. If this
 * lags upstream again the escape hatch is
 * `ignoreRules: ["hook.unknown-event"]`, but the right fix is to update it.
 *
 * Source: docs/spec/hook-events.md (read 2026-08-09)
 */
export const KNOWN_HOOK_EVENTS = new Set([
  "SessionStart",
  "Setup",
  "UserPromptSubmit",
  "UserPromptExpansion",
  "PreToolUse",
  "PermissionRequest",
  "PermissionDenied",
  "PostToolUse",
  "PostToolUseFailure",
  "PostToolBatch",
  "Notification",
  "MessageDisplay",
  "SubagentStart",
  "SubagentStop",
  "TaskCreated",
  "TaskCompleted",
  "Stop",
  "StopFailure",
  "TeammateIdle",
  "InstructionsLoaded",
  "ConfigChange",
  "CwdChanged",
  "DirectoryAdded",
  "FileChanged",
  "WorktreeCreate",
  "WorktreeRemove",
  "PreCompact",
  "PostCompact",
  "Elicitation",
  "ElicitationResult",
  "SessionEnd",
]);

function checkHookEvents(facts: Facts): Finding[] {
  const out: Finding[] = [];
  const reported = new Set<string>();
  for (const hook of facts.hooks) {
    const event = hook.event ?? hook.name;
    if (KNOWN_HOOK_EVENTS.has(event) || reported.has(event)) {
      continue;
    }
    reported.add(event);
    out.push(
      make("hook.unknown-event", `hook:${event}`, {
        action: "warn",
        severity: "error",
        message: `"${event}" is not a hook event that gets dispatched`,
        reason:
          "Hook events are matched by exact name. An unrecognised name never matches, so everything registered under it silently never runs — a typo here looks identical to a working hook.",
        evidence: [
          { kind: "hook", value: `${event} @ ${hook.path}` },
          {
            kind: "known",
            value: [...KNOWN_HOOK_EVENTS].join(", "),
          },
        ],
        suggest: `Fix the event name in ${hook.path} (or ignoreRules: ["hook.unknown-event"] if it is newly supported)`,
      }),
    );
  }
  return out;
}

function checkHooks(facts: Facts): Finding[] {
  const out: Finding[] = [];
  // One HookFact per command occurrence, so the same guard under two matchers —
  // the canonical shape — produced two findings sharing one id, and `explain`
  // could reach only the first.
  const reported = new Set<string>();
  for (const hook of facts.hooks) {
    if (hook.scriptPath === undefined || hook.scriptExists !== false) {
      continue;
    }
    const subject = `hook:${hook.event ?? hook.name}:${hook.scriptPath}`;
    if (reported.has(subject)) {
      continue;
    }
    reported.add(subject);
    out.push(
      make("hook.missing-script", subject, {
          action: "warn",
          severity: "error",
          message: `${hook.event ?? hook.name} hook points at a script that does not exist: ${hook.scriptPath}`,
          reason:
            "The hook is registered but its script is missing, so it never runs. A guard hook that silently does nothing is worse than no hook — the config claims a protection that is not in effect.",
          evidence: [
            { kind: "hook", value: `${hook.event ?? hook.name} @ ${hook.path}` },
            { kind: "script", value: hook.scriptPath },
          ],
        suggest: `Restore ${hook.scriptPath} or remove the hook from ${hook.path}`,
      }),
    );
  }
  return out;
}

/** Global skills live outside the repo; say so, or a reader cannot tell. */
function skillEvidence(skill: SkillFact, value: string): Finding["evidence"] {
  const evidence: Finding["evidence"] = [{ kind: "skill", value }];
  if (skill.source === "global") {
    evidence.push({ kind: "source", value: "global" });
  }
  return evidence;
}

function checkSkillStructure(facts: Facts): Finding[] {
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
        make("skill.missing-skill-md", `skill:${skill.id}`, {
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

    if (!skill.hasFrontmatter) {
      out.push(
        make("skill.missing-frontmatter", `skill:${skill.id}`, {
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
    if (broken !== undefined && broken.length > 0) {
      const shown = broken.slice(0, 3).join(", ");
      const rest = broken.length - Math.min(3, broken.length);
      out.push(
        make("skill.broken-reference", `skill:${skill.id}`, {
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

    if (skill.description === undefined) {
      out.push(
        make("skill.missing-description", `skill:${skill.id}`, {
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

function checkLockIntegrity(facts: Facts, options: CheckOptions): Finding[] {
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

  const onDisk = new Set(projectSkills.map((s) => s.id));
  const locked = new Map(facts.lockedSkills.map((l) => [l.id, l]));

  for (const skill of projectSkills) {
    if (locked.has(skill.id)) {
      continue;
    }
    out.push(
      make("skill.not-in-lock", `skill:${skill.id}`, {
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
function checkDuplicateDescriptions(facts: Facts): Finding[] {
  const groups = new Map<string, string[]>();
  for (const skill of facts.skills) {
    if (skill.source !== "project" || skill.description === undefined) {
      continue;
    }
    const key = skill.description.trim().replace(/\s+/g, " ").toLowerCase();
    if (key.length === 0) {
      continue;
    }
    groups.set(key, [...(groups.get(key) ?? []), skill.id]);
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
function checkDescriptionBudget(
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
  // Bytes, not UTF-16 units — the threshold and docs/spec/thresholds.md are
  // both stated in bytes, and `.length` half-counts non-ASCII.
  const bytes = project.reduce(
    (sum, s) =>
      sum + Buffer.byteLength(s.id) + Buffer.byteLength(s.description ?? ""),
    0,
  );
  if (bytes <= ceiling) {
    return [];
  }
  return [
    make("skill.description-budget", "skills:description-budget", {
      action: "warn",
      severity: "info",
      message: `Skill descriptions total ${bytes} bytes across ${project.length} skills (over ${ceiling})`,
      reason:
        "Names and descriptions for every skill are loaded at startup, within a budget of roughly 1-2% of the context window. Past it they are truncated, and a skill whose description is cut short stops being matched for the tasks it was written for.",
      evidence: [
        { kind: "count", value: `descriptionBytes=${bytes}` },
        { kind: "threshold", value: String(ceiling) },
      ],
      suggest:
        "Shorten the longest descriptions, or remove skills this project does not use",
    }),
  ];
}

/**
 * Agent definitions, checked for structure only.
 *
 * Two checks, not four. `agent.unknown-model` and `agent.unknown-tool` were
 * planned and cut: both would hardcode a list of valid values and report
 * anything absent from it, which is exactly the shape of the hook-event list
 * that held 9 of 31 names and called a working hook dead at severity error.
 * Model ids change and MCP tool names are per-machine. See plans/003 for the
 * conditions under which they may return.
 *
 * Frontmatter `name` is deliberately not compared to the filename — see
 * docs/spec/skills.md for the same trap, and the regression test that guards it.
 */
function checkAgents(facts: Facts): Finding[] {
  const out: Finding[] = [];
  for (const agent of facts.agents) {
    if (agent.unreadable === true || agent.unparseableFrontmatter === true) {
      // config.unreadable names it. Anything else here would be a statement
      // about a file the adjacent finding admits we could not read.
      continue;
    }

    if (!agent.hasFrontmatter) {
      out.push(
        make("agent.missing-frontmatter", `agent:${agent.name}`, {
          action: "warn",
          severity: "warning",
          message: "Agent definition has no YAML frontmatter block",
          reason:
            "An agent is selected by its declared description; without a frontmatter block there is nothing to select on, and the file is unlikely to load as an agent at all.",
          evidence: [{ kind: "agent", value: agent.path }],
          suggest: "Add a --- delimited block with a description",
        }),
      );
      continue;
    }
    if (agent.description === undefined) {
      out.push(
        make("agent.missing-description", `agent:${agent.name}`, {
          action: "warn",
          severity: "info",
          message: "Agent frontmatter has no `description`",
          reason:
            "The description is how the main session decides which agent to dispatch. Without one the agent can still be named explicitly, but it will not be chosen on its own.",
          evidence: [{ kind: "agent", value: agent.path }],
          suggest: "Add a one-line description saying when to dispatch it",
        }),
      );
    }
  }
  return out;
}

function checkMcp(facts: Facts): Finding[] {
  const out: Finding[] = [];
  for (const server of facts.mcp) {
    if (!(server.hasCommand || server.hasUrl)) {
      out.push(
        make("mcp.no-launch", `mcp:${server.name}@${server.path}`, {
          action: "warn",
          severity: "error",
          message: `MCP server "${server.name}" declares neither command nor url`,
          reason:
            "There is no way to start or reach this server, so its tools are never available — the entry is dead weight that still costs a config read.",
          evidence: [{ kind: "mcp", value: `${server.name} @ ${server.path}` }],
          suggest: `Add a command (or url) for "${server.name}", or remove it`,
        }),
      );
    }

    // Documented behaviour: an entry with a url and no `type` is read as a
    // stdio server, fails, and is skipped — so its tools are silently absent.
    if (server.hasUrl && server.transport === undefined) {
      out.push(
        make("mcp.url-without-type", `mcp:${server.name}@${server.path}`, {
          action: "warn",
          severity: "error",
          message: `MCP server "${server.name}" has a url but no transport type`,
          reason:
            "An entry with no `type` is read as a stdio server, so a remote server declared this way fails to start and is skipped — its tools never appear, with no error in the report you are reading. See docs/spec/mcp.md.",
          evidence: [{ kind: "mcp", value: `${server.name} @ ${server.path}` }],
          suggest: `Add "type": "http" (or "sse" / "ws") to "${server.name}"`,
        }),
      );
    }

    const hit = SECRET_PATTERNS.find((p) => p.re.test(server.raw));
    if (hit !== undefined) {
      out.push(
        make("mcp.hardcoded-secret", `mcp:${server.name}@${server.path}`, {
          action: "warn",
          severity: "error",
          // The matched value is deliberately never echoed.
          message: `MCP server "${server.name}" contains what looks like a hardcoded credential (${hit.label})`,
          reason:
            "Credentials in a config file get committed, shared and cached. Treat it as leaked: rotate the key, then reference it through an environment variable.",
          evidence: [{ kind: "mcp", value: `${server.name} @ ${server.path}` }],
          suggest:
            "Rotate the credential, then replace the literal with ${ENV_VAR}",
        }),
      );
      continue;
    }

    if (server.literalEnvKeys.length > 0) {
      out.push(
        make("mcp.literal-env", `mcp:${server.name}@${server.path}`, {
          action: "warn",
          severity: "warning",
          message: `MCP server "${server.name}" has literal env values: ${server.literalEnvKeys.join(", ")}`,
          reason:
            "Long literal env values in config are usually secrets that should be indirected through ${VAR} so they are never committed.",
          evidence: [
            { kind: "mcp", value: `${server.name} @ ${server.path}` },
            { kind: "env", value: server.literalEnvKeys.join(",") },
          ],
          suggest: "Replace the literals with ${ENV_VAR} references",
        }),
      );
    }
  }
  return out;
}

/**
 * Run every structural check. Order is deterministic; `check.ts` sorts anyway.
 */
export function runChecks(
  facts: Facts,
  options: CheckOptions = {},
): Finding[] {
  return [
    ...checkConfigErrors(facts),
    ...checkHookEvents(facts),
    ...checkHooks(facts),
    ...checkSkillStructure(facts),
    ...checkLockIntegrity(facts, options),
    ...checkDuplicateDescriptions(facts),
    ...checkDescriptionBudget(facts, options),
    ...checkAgents(facts),
    ...checkMcp(facts),
    ...(options.budgets === undefined
      ? []
      : runBudgets(facts, options.budgets)),
  ];
}
