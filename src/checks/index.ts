import { basename } from "node:path";
import type { Facts, Finding, SkillFact } from "../facts/types";

/**
 * Structural config checks.
 *
 * These are code, not YAML rules, on purpose: the rules engine matches aggregate
 * facts (is dep X present, is this count over N), while these validate each
 * discovered item against its own file on disk. Expressing them as YAML would
 * mean inventing a bespoke clause per check.
 */

export type CheckOptions = {
  /** Flag a project that has skills but no skills-lock.json. Off by default. */
  requireLock?: boolean;
};

/**
 * Every id `runChecks` can emit, so `agentscan rules` can show the whole picture
 * rather than only the YAML half. Keep in sync with the functions below — the
 * `checks emit only declared ids` test fails if they drift.
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
    id: "skill.no-lockfile",
    description: "Skills present with no skills-lock.json (requireLock only)",
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
  { label: "OpenAI-style key", re: /\bsk-[A-Za-z0-9_-]{16,}/ },
  { label: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{20,}/ },
  { label: "Google API key", re: /\bAIza[A-Za-z0-9_-]{20,}/ },
  { label: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { label: "AWS access key id", re: /\bAKIA[0-9A-Z]{16}\b/ },
];

function make(
  ruleId: string,
  subject: string,
  args: {
    action: Finding["action"];
    severity: Finding["severity"];
    message: string;
    reason: string;
    evidence: Finding["evidence"];
    suggest?: string;
  },
): Finding {
  const finding: Finding = {
    id: `${ruleId}:${subject}`,
    ruleId,
    action: args.action,
    severity: args.severity,
    subject,
    message: args.message,
    reason: args.reason,
    evidence: args.evidence,
  };
  if (args.suggest !== undefined) {
    finding.suggest = args.suggest;
  }
  return finding;
}

function checkConfigErrors(facts: Facts): Finding[] {
  return facts.configErrors.map((err) => {
    const what =
      err.kind === "invalid-json"
        ? "is not valid JSON"
        : err.kind === "unreadable"
          ? "could not be read"
          : "has an unexpected shape";
    return make("config.unreadable", `config:${err.path}`, {
      action: "warn",
      severity: "error",
      message: `${basename(err.path)} ${what} — its contents are invisible to the scan`,
      reason:
        "An unparseable config is silently ignored by the tools that read it, so whatever it configured is simply not in effect.",
      evidence: [
        { kind: "config", value: err.path },
        { kind: "detail", value: err.detail },
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
 * Source: https://code.claude.com/docs/en/hooks
 */
const KNOWN_HOOK_EVENTS = new Set([
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
  for (const hook of facts.hooks) {
    if (hook.scriptPath === undefined || hook.scriptExists !== false) {
      continue;
    }
    out.push(
      make(
        "hook.missing-script",
        `hook:${hook.event ?? hook.name}:${hook.scriptPath}`,
        {
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
        },
      ),
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

    if (skill.unreadable === true) {
      // config.unreadable already reports this; claiming "no frontmatter"
      // would send the author to fix a file that may be perfectly valid.
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

    if (skill.description === undefined) {
      out.push(
        make("skill.missing-description", `skill:${skill.id}`, {
          action: "warn",
          // The spec marks description "Recommended", not required — a skill
          // without one still loads when invoked by name.
          severity: "info",
          message: "SKILL.md frontmatter has no `description`",
          reason:
            "The description is what Claude matches against when deciding to load a skill automatically. Without it the skill still works when invoked directly, but it will not be picked up on its own.",
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
  const projectSkills = facts.skills.filter((s) => s.source === "project");

  if (!facts.hasSkillsLock) {
    if (options.requireLock === true && projectSkills.length > 0) {
      out.push(
        make("skill.no-lockfile", "skills:unpinned", {
          action: "warn",
          severity: "info",
          message: `${projectSkills.length} skills installed with no skills-lock.json`,
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

function checkMcp(facts: Facts): Finding[] {
  const out: Finding[] = [];
  for (const server of facts.mcp) {
    if (!(server.hasCommand || server.hasUrl)) {
      out.push(
        make("mcp.no-launch", `mcp:${server.name}`, {
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
        make("mcp.url-without-type", `mcp:${server.name}`, {
          action: "warn",
          severity: "error",
          message: `MCP server "${server.name}" has a url but no transport type`,
          reason:
            "An entry with no `type` is read as a stdio server, so a remote server declared this way fails to start and is skipped — its tools never appear, with no error in the report you are reading.",
          evidence: [{ kind: "mcp", value: `${server.name} @ ${server.path}` }],
          suggest: `Add "type": "http" (or "sse" / "ws") to "${server.name}"`,
        }),
      );
    }

    const hit = SECRET_PATTERNS.find((p) => p.re.test(server.raw));
    if (hit !== undefined) {
      out.push(
        make("mcp.hardcoded-secret", `mcp:${server.name}`, {
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
        make("mcp.literal-env", `mcp:${server.name}`, {
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
    ...checkMcp(facts),
  ];
}
