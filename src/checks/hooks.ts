import { COMMANDCODE_HOOK_EVENTS, isShadowedCommandcode } from "../facts/commandcode";
import { assertNever, type Provider } from "../facts/provider";
import type { Facts, Finding, HookDefect, HookFact } from "../facts/types";
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
 * Source: docs/spec/hook-events.md (read 2026-08-30)
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

/** Source: docs/spec/vscode-hooks.md (read 2026-08-30) */
export const VSCODE_HOOK_EVENTS = new Set([
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PreCompact",
  "SubagentStart",
  "SubagentStop",
  "Stop",
]);

function hookProvider(hook: HookFact): Provider {
  return hook.sourceProvider ?? "claude";
}

function eventsFor(provider: Provider): Set<string> | undefined {
  switch (provider) {
    case "claude":
      return KNOWN_HOOK_EVENTS;
    case "vscode":
      return VSCODE_HOOK_EVENTS;
    case "commandcode":
      return COMMANDCODE_HOOK_EVENTS;
    case "agent-skills":
    case "codex":
    case "cursor":
    case "grok":
    case "antigravity":
    case "gemini":
    case "windsurf":
    case "kiro":
    case "cline":
    case "roo":
    case "kilo":
    case "opencode":
    case "junie":
    case "continue":
    case "unknown":
      return undefined;
    default: {
      return assertNever(provider, `unhandled hook provider: ${provider}`);
    }
  }
}

function unknownEventRuleId(provider: Provider): string | undefined {
  switch (provider) {
    case "claude":
      return "claude.hook.unknown-event";
    case "vscode":
      return "vscode.hook.unknown-event";
    case "commandcode":
      return "commandcode.hook.unknown-event";
    case "agent-skills":
    case "codex":
    case "cursor":
    case "grok":
    case "antigravity":
    case "gemini":
    case "windsurf":
    case "kiro":
    case "cline":
    case "roo":
    case "kilo":
    case "opencode":
    case "junie":
    case "continue":
    case "unknown":
      return undefined;
    default: {
      return assertNever(provider, `unhandled hook provider: ${provider}`);
    }
  }
}

function missingScriptRuleId(provider: Provider): string | undefined {
  switch (provider) {
    case "claude":
      return "claude.hook.missing-script";
    case "vscode":
      return "vscode.hook.missing-script";
    case "commandcode":
      return "commandcode.hook.missing-script";
    case "agent-skills":
    case "codex":
    case "cursor":
    case "grok":
    case "antigravity":
    case "gemini":
    case "windsurf":
    case "kiro":
    case "cline":
    case "roo":
    case "kilo":
    case "opencode":
    case "junie":
    case "continue":
    case "unknown":
      return undefined;
    default: {
      return assertNever(provider, `unhandled hook provider: ${provider}`);
    }
  }
}

function isCommandHandler(hook: HookFact): boolean {
  const type = hook.handlerType;
  if (type === undefined) {
    return hook.command !== undefined || hook.scriptPath !== undefined;
  }
  switch (type) {
    case "command":
      return true;
    case "http":
    case "mcp_tool":
    case "prompt":
    case "agent":
      return false;
    default: {
      return assertNever(type, `unhandled hook handler type: ${type}`);
    }
  }
}

export function checkHookEvents(facts: Facts): Finding[] {
  const out: Finding[] = [];
  const reported = new Set<string>();
  for (const hook of facts.hooks) {
    if (isShadowedCommandcode(hook.commandcodeEffective)) {
      continue;
    }
    const provider = hookProvider(hook);
    const known = eventsFor(provider);
    const ruleId = unknownEventRuleId(provider);
    if (known === undefined || ruleId === undefined) {
      continue;
    }
    const event = hook.event ?? hook.name;
    const key = `${provider}:${event}`;
    if (known.has(event) || reported.has(key)) {
      continue;
    }
    reported.add(key);
    out.push(
      make(ruleId, `hook:${event}`, {
        action: "warn",
        severity: "error",
        message: `"${event}" is not a hook event that gets dispatched`,
        reason:
          "Hook events are matched by exact name. An unrecognised name never matches, so everything registered under it silently never runs — a typo here looks identical to a working hook. Event sets are per provider; a VS Code name is not validated against Claude's list.",
        evidence: [
          { kind: "hook", value: `${event} @ ${hook.path}` },
          {
            kind: "known",
            value: [...known].join(", "),
          },
        ],
        suggest: `Fix the event name in ${hook.path} (or ignoreRules: ["${ruleId}"] if it is newly supported)`,
      }),
    );
  }
  return out;
}

function defectRuleId(provider: Provider, defect: HookDefect): string | undefined {
  switch (provider) {
    case "claude":
    case "vscode":
      return `${provider}.hook.${defect}`;
    case "commandcode":
      switch (defect) {
        case "invalid-group":
        case "command-without-command":
        case "unknown-handler-type":
          return `commandcode.hook.${defect}`;
        case "http-without-url":
        case "mcp-tool-without-name":
          return undefined;
        default: {
          return assertNever(defect, `unhandled hook defect: ${defect}`);
        }
      }
    case "agent-skills":
    case "codex":
    case "cursor":
    case "grok":
    case "antigravity":
    case "gemini":
    case "windsurf":
    case "kiro":
    case "cline":
    case "roo":
    case "kilo":
    case "opencode":
    case "junie":
    case "continue":
    case "unknown":
      return undefined;
    default: {
      return assertNever(provider, `unhandled hook provider: ${provider}`);
    }
  }
}

function defectMessage(hook: HookFact, defect: HookDefect): string {
  const event = hook.event ?? hook.name;
  switch (defect) {
    case "invalid-group":
      if (hook.commandcodeInvalidMatcher === true) {
        return `${event} hook matcher is not a string`;
      }
      return `${event} hook group is missing a \`hooks\` array`;
    case "command-without-command":
      return `${event} command hook declares no command`;
    case "http-without-url":
      return `${event} http hook declares no url`;
    case "mcp-tool-without-name":
      return `${event} MCP tool hook declares no tool name`;
    case "unknown-handler-type":
      return `${event} hook has unknown handler type "${hook.unknownHandlerType ?? "unknown"}"`;
    default: {
      return assertNever(defect, `unhandled hook defect: ${defect}`);
    }
  }
}

export function checkHookShape(facts: Facts): Finding[] {
  const out: Finding[] = [];
  const reported = new Set<string>();
  for (const hook of facts.hooks) {
    if (isShadowedCommandcode(hook.commandcodeEffective)) {
      continue;
    }
    const defect = hook.defect;
    if (defect === undefined) {
      continue;
    }
    const ruleId = defectRuleId(hookProvider(hook), defect);
    if (ruleId === undefined) {
      continue;
    }
    const subject = `hook:${hook.event ?? hook.name}${
      hook.unknownHandlerType === undefined ? "" : `:${hook.unknownHandlerType}`
    }`;
    const key = `${ruleId}:${subject}:${hook.path}`;
    if (reported.has(key)) {
      continue;
    }
    reported.add(key);
    out.push(
      make(ruleId, subject, {
        action: "warn",
        severity: "error",
        message: defectMessage(hook, defect),
        reason:
          "A hook entry that is missing its required fields never runs. The previous scanner rejected these shapes; accepting them silently hid dead configuration.",
        evidence: [
          { kind: "hook", value: `${hook.event ?? hook.name} @ ${hook.path}` },
          { kind: "shape", value: defect },
        ],
        suggest: `Fix the ${eventLabel(hook)} entry in ${hook.path}`,
      }),
    );
  }
  return out;
}

function eventLabel(hook: HookFact): string {
  return hook.event ?? hook.name;
}

export function checkHooks(facts: Facts): Finding[] {
  const out: Finding[] = [...checkHookShape(facts)];
  // One HookFact per command occurrence, so the same guard under two matchers —
  // the canonical shape — produced two findings sharing one id, and `explain`
  // could reach only the first.
  const reported = new Set<string>();
  for (const hook of facts.hooks) {
    if (isShadowedCommandcode(hook.commandcodeEffective)) {
      continue;
    }
    if (hookProvider(hook) === "commandcode" && hook.timeoutOutOfBounds === true) {
      const subject = `hook:${hook.event ?? hook.name}:timeout`;
      const key = `commandcode.hook.timeout-out-of-bounds:${subject}:${hook.path}`;
      if (!reported.has(key)) {
        reported.add(key);
        const bound =
          hook.timeout === undefined ? "not a number in 0–600" : String(hook.timeout);
        out.push(
          make("commandcode.hook.timeout-out-of-bounds", subject, {
            action: "warn",
            severity: "error",
            message: `${hook.event ?? hook.name} hook timeout is out of bounds (${bound}; want 0–600 seconds)`,
            reason:
              "Command Code hook timeouts are seconds in the closed range 0–600. A value outside that range is not a valid timeout. See docs/spec/commandcode-hooks.md.",
            evidence: [
              { kind: "hook", value: `${hook.event ?? hook.name} @ ${hook.path}` },
              { kind: "timeout", value: bound },
            ],
            suggest: `Set timeout to an integer from 0 to 600 in ${hook.path}`,
          }),
        );
      }
    }
    if (!isCommandHandler(hook)) {
      continue;
    }
    if (hook.scriptPath === undefined || hook.scriptExists !== false) {
      continue;
    }
    const provider = hookProvider(hook);
    const ruleId = missingScriptRuleId(provider);
    if (ruleId === undefined) {
      continue;
    }
    const subject = `hook:${hook.event ?? hook.name}:${hook.scriptPath}`;
    if (reported.has(`${ruleId}:${subject}`)) {
      continue;
    }
    reported.add(`${ruleId}:${subject}`);
    out.push(
      make(ruleId, subject, {
        action: "warn",
        severity: "error",
        message: `${hook.event ?? hook.name} hook points at a script that does not exist: ${hook.scriptPath}`,
        reason:
          "The hook is registered but its script is missing, so it never runs. A guard hook that silently does nothing is worse than no hook — the config claims a protection that is not in effect. A relative path is looked for beside the file that declared it and at the project root; it is at neither. Non-command handlers (http, mcp_tool, prompt, agent) are not path-checked.",
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
