import type { Facts, Finding } from "../facts/types";

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

/** Token shapes worth failing a build over. Deliberately narrow — no entropy guessing. */
const SECRET_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "OpenAI-style key", re: /\bsk-[A-Za-z0-9_-]{16,}/ },
  { label: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{20,}/ },
  { label: "Google API key", re: /\bAIza[A-Za-z0-9_-]{20,}/ },
  { label: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { label: "AWS access key id", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: "Anthropic key", re: /\bsk-ant-[A-Za-z0-9_-]{16,}/ },
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
      message: `Config file ${what} — skillscan cannot see what it declares`,
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
 * Hook events the agent actually dispatches. A name outside this set is never
 * matched, so the hook silently never runs.
 *
 * If a new event is added upstream and this list lags, the escape hatch is
 * `ignoreRules: ["hook.unknown-event"]`.
 */
const KNOWN_HOOK_EVENTS = new Set([
  "PreToolUse",
  "PostToolUse",
  "UserPromptSubmit",
  "Notification",
  "Stop",
  "SubagentStop",
  "PreCompact",
  "SessionStart",
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
          evidence: [{ kind: "skill", value: skill.path }],
          suggest: `Add ${skill.path}/SKILL.md or remove the directory`,
        }),
      );
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
          evidence: [{ kind: "skill", value: `${skill.path}/SKILL.md` }],
          suggest: "Add a --- delimited block with name and description",
        }),
      );
      continue;
    }

    if (skill.frontmatterName === undefined) {
      out.push(
        make("skill.missing-name", `skill:${skill.id}`, {
          action: "warn",
          severity: "warning",
          message: "SKILL.md frontmatter has no `name`",
          reason: "Frontmatter must declare name and description.",
          evidence: [{ kind: "skill", value: `${skill.path}/SKILL.md` }],
          suggest: `Add "name: ${skill.id}" to the frontmatter`,
        }),
      );
    } else if (skill.frontmatterName !== skill.id) {
      out.push(
        make("skill.name-mismatch", `skill:${skill.id}`, {
          action: "warn",
          severity: "warning",
          message: `Frontmatter name "${skill.frontmatterName}" does not match directory "${skill.id}"`,
          reason:
            "Two different names for one skill: tools that key on the directory and tools that key on frontmatter disagree about what this skill is called, and the lockfile keys on the directory.",
          evidence: [
            { kind: "skill", value: `${skill.path}/SKILL.md` },
            { kind: "name", value: skill.frontmatterName },
          ],
          suggest: `Rename the directory to ${skill.frontmatterName}, or set name: ${skill.id}`,
        }),
      );
    }

    if (skill.description === undefined) {
      out.push(
        make("skill.missing-description", `skill:${skill.id}`, {
          action: "warn",
          severity: "warning",
          message: "SKILL.md frontmatter has no `description`",
          reason:
            "The description is what an agent matches against when choosing a skill; without it the skill is effectively unreachable.",
          evidence: [{ kind: "skill", value: `${skill.path}/SKILL.md` }],
          suggest: "Add a one-line description to the frontmatter",
        }),
      );
    }
  }
  return out;
}

function checkLockIntegrity(facts: Facts, options: CheckOptions): Finding[] {
  const out: Finding[] = [];

  if (!facts.hasSkillsLock) {
    if (options.requireLock === true && facts.skills.length > 0) {
      out.push(
        make("skill.no-lockfile", "skills:unpinned", {
          action: "warn",
          severity: "info",
          message: `${facts.skills.length} skills installed with no skills-lock.json`,
          reason:
            "Without a lockfile there is no record of where each skill came from or which version is pinned, so nothing can tell a managed install from a local edit.",
          evidence: [{ kind: "count", value: `skills=${facts.skills.length}` }],
          suggest: "Manage skills with a tool that writes skills-lock.json",
        }),
      );
    }
    return out;
  }

  const onDisk = new Set(facts.skills.map((s) => s.id));
  const locked = new Map(facts.lockedSkills.map((l) => [l.id, l]));

  for (const skill of facts.skills) {
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
        evidence: [{ kind: "skill", value: skill.path }],
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
