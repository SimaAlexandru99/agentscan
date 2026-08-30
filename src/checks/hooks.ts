import type { Facts, Finding } from "../facts/types";
import { make } from "./make";

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
  "PreModelSwitch",
  "PostModelSwitch",
]);

export function checkHookEvents(facts: Facts): Finding[] {
  const out: Finding[] = [];
  const reported = new Set<string>();
  for (const hook of facts.hooks) {
    const event = hook.event ?? hook.name;
    if (KNOWN_HOOK_EVENTS.has(event) || reported.has(event)) {
      continue;
    }
    reported.add(event);
    out.push(
      make("claude.hook.unknown-event", `hook:${event}`, {
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
        suggest: `Fix the event name in ${hook.path} (or ignoreRules: ["claude.hook.unknown-event"] if it is newly supported)`,
      }),
    );
  }
  return out;
}
export function checkHooks(facts: Facts): Finding[] {
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
      make("claude.hook.missing-script", subject, {
          action: "warn",
          severity: "error",
          message: `${hook.event ?? hook.name} hook points at a script that does not exist: ${hook.scriptPath}`,
          reason:
            "The hook is registered but its script is missing, so it never runs. A guard hook that silently does nothing is worse than no hook — the config claims a protection that is not in effect. A relative path is looked for beside the file that declared it and at the project root; it is at neither.",
          evidence: [
            { kind: "hook", value: `${hook.event ?? hook.name} @ ${hook.path}` },
            { kind: "script", value: hook.scriptPath },
            // Only when it is not a settings file, so the common finding renders
            // exactly as before. Same idiom as `source: global` on skills.
            ...(hook.source === undefined || hook.source === "settings"
              ? []
              : [{ kind: "source", value: hook.source }]),
          ],
        suggest: `Restore ${hook.scriptPath} or remove the hook from ${hook.path}`,
      }),
    );
  }
  return out;
}
