import { COMMANDCODE_HOOK_EVENTS, isShadowedCommandcode } from "../facts/commandcode";
import { GROK_HOOK_EVENTS } from "../facts/grok";
import { WINDSURF_HOOK_EVENTS } from "../discover/windsurf";
import {
  COPILOT_HOOK_EVENTS,
  inferHookSchemaProfile,
  isKnownCopilotEvent,
  KNOWN_HOOK_EVENTS,
  VSCODE_HOOK_EVENTS,
  type HookSchemaProfile,
} from "../facts/hook-schema";
import { assertNever, type Provider } from "../facts/provider";
import type { Facts, Finding, HookDefect, HookFact } from "../facts/types";
import { make } from "./make";

export { COPILOT_HOOK_EVENTS, KNOWN_HOOK_EVENTS, VSCODE_HOOK_EVENTS };

function hookProvider(hook: HookFact): Provider {
  return hook.sourceProvider ?? "claude";
}

function hookProfile(hook: HookFact): HookSchemaProfile {
  return inferHookSchemaProfile(hookProvider(hook), hook.schemaProfile);
}

function eventsFor(profile: HookSchemaProfile): Set<string> {
  switch (profile) {
    case "claude":
      return KNOWN_HOOK_EVENTS;
    case "vscode-native":
      return VSCODE_HOOK_EVENTS;
    case "copilot-cli":
      return COPILOT_HOOK_EVENTS;
    case "commandcode":
      return COMMANDCODE_HOOK_EVENTS;
    case "grok":
      return GROK_HOOK_EVENTS;
    case "windsurf":
      return WINDSURF_HOOK_EVENTS;
    default: {
      return assertNever(profile, `unhandled hook schema profile: ${profile}`);
    }
  }
}

function unknownEventRuleId(profile: HookSchemaProfile): string {
  switch (profile) {
    case "claude":
      return "claude.hook.unknown-event";
    case "vscode-native":
      return "vscode.hook.unknown-event";
    case "copilot-cli":
      return "copilot.hook.unknown-event";
    case "commandcode":
      return "commandcode.hook.unknown-event";
    case "grok":
      return "grok.hook.unknown-event";
    case "windsurf":
      return "windsurf.hook.unknown-event";
    default: {
      return assertNever(profile, `unhandled hook schema profile: ${profile}`);
    }
  }
}

function missingScriptRuleId(profile: HookSchemaProfile): string {
  switch (profile) {
    case "claude":
      return "claude.hook.missing-script";
    case "vscode-native":
      return "vscode.hook.missing-script";
    case "copilot-cli":
      return "copilot.hook.missing-script";
    case "commandcode":
      return "commandcode.hook.missing-script";
    case "grok":
      return "grok.hook.missing-script";
    case "windsurf":
      return "windsurf.hook.missing-script";
    default: {
      return assertNever(profile, `unhandled hook schema profile: ${profile}`);
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

function eventIsKnown(profile: HookSchemaProfile, event: string): boolean {
  if (profile === "copilot-cli") {
    return isKnownCopilotEvent(event);
  }
  return eventsFor(profile).has(event);
}

export function checkHookEvents(facts: Facts): Finding[] {
  const out: Finding[] = [];
  const reported = new Set<string>();
  for (const hook of facts.hooks) {
    if (isShadowedCommandcode(hook.commandcodeEffective)) {
      continue;
    }
    const profile = hookProfile(hook);
    const ruleId = unknownEventRuleId(profile);
    const event = hook.event ?? hook.name;
    const key = `${profile}:${event}`;
    if (eventIsKnown(profile, event) || reported.has(key)) {
      continue;
    }
    reported.add(key);
    const known = eventsFor(profile);
    out.push(
      make(ruleId, `hook:${event}`, {
        action: "warn",
        severity: "error",
        message: `"${event}" is not a hook event that gets dispatched`,
        reason:
          "Hook events are matched by exact name. An unrecognised name never matches, so everything registered under it silently never runs — a typo here looks identical to a working hook. Event sets are per schema profile; a VS Code name is not validated against Claude's list, and Copilot CLI camelCase names map onto VS Code events where the Copilot hooks reference documents that mapping.",
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

function defectRuleId(profile: HookSchemaProfile, defect: HookDefect): string | undefined {
  switch (profile) {
    case "claude":
      switch (defect) {
        case "invalid-group":
        case "command-without-command":
        case "http-without-url":
        case "mcp-tool-without-server-or-tool":
        case "prompt-without-prompt":
        case "unknown-handler-type":
        case "incompatible-handler":
          return `claude.hook.${defect}`;
        default: {
          return assertNever(defect, `unhandled hook defect: ${defect}`);
        }
      }
    case "vscode-native":
      switch (defect) {
        case "invalid-group":
        case "command-without-command":
        case "unknown-handler-type":
          return `vscode.hook.${defect}`;
        case "http-without-url":
        case "mcp-tool-without-server-or-tool":
        case "prompt-without-prompt":
        case "incompatible-handler":
          return undefined;
        default: {
          return assertNever(defect, `unhandled hook defect: ${defect}`);
        }
      }
    case "copilot-cli":
      switch (defect) {
        case "command-without-command":
        case "http-without-url":
        case "prompt-without-prompt":
        case "unknown-handler-type":
        case "incompatible-handler":
          return `copilot.hook.${defect}`;
        case "invalid-group":
        case "mcp-tool-without-server-or-tool":
          return undefined;
        default: {
          return assertNever(defect, `unhandled hook defect: ${defect}`);
        }
      }
    case "commandcode":
      switch (defect) {
        case "invalid-group":
        case "command-without-command":
        case "unknown-handler-type":
          return `commandcode.hook.${defect}`;
        case "http-without-url":
        case "mcp-tool-without-server-or-tool":
        case "prompt-without-prompt":
        case "incompatible-handler":
          return undefined;
        default: {
          return assertNever(defect, `unhandled hook defect: ${defect}`);
        }
      }
    case "grok":
      switch (defect) {
        case "invalid-group":
        case "command-without-command":
        case "http-without-url":
        case "unknown-handler-type":
          return `grok.hook.${defect}`;
        case "mcp-tool-without-server-or-tool":
        case "prompt-without-prompt":
        case "incompatible-handler":
          return undefined;
        default: {
          return assertNever(defect, `unhandled hook defect: ${defect}`);
        }
      }
    case "windsurf":
      switch (defect) {
        case "command-without-command":
          return "windsurf.hook.command-without-command";
        case "invalid-group":
        case "http-without-url":
        case "mcp-tool-without-server-or-tool":
        case "prompt-without-prompt":
        case "unknown-handler-type":
        case "incompatible-handler":
          return undefined;
        default: {
          return assertNever(defect, `unhandled hook defect: ${defect}`);
        }
      }
    default: {
      return assertNever(profile, `unhandled hook schema profile: ${profile}`);
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
      if (hookProfile(hook) === "copilot-cli") {
        return `${event} command hook declares none of bash, powershell, command, or exec`;
      }
      if (hookProfile(hook) === "windsurf") {
        return `${event} hook declares neither command nor powershell`;
      }
      return `${event} command hook declares no command`;
    case "http-without-url":
      return `${event} http hook declares no url`;
    case "mcp-tool-without-server-or-tool":
      return `${event} MCP tool hook declares no server and tool`;
    case "prompt-without-prompt":
      return `${event} ${hook.handlerType ?? "prompt"} hook declares no prompt`;
    case "unknown-handler-type":
      return `${event} hook has unknown handler type "${hook.unknownHandlerType ?? "unknown"}"`;
    case "incompatible-handler":
      return `${event} does not accept handler type "${hook.handlerType ?? "unknown"}"`;
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
    const ruleId = defectRuleId(hookProfile(hook), defect);
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
          "A hook entry that is missing its required fields, or that uses a handler type the event does not dispatch, never runs. The previous scanner rejected these shapes; accepting them silently hid dead configuration.",
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
    if (hookProfile(hook) === "commandcode" && hook.timeoutOutOfBounds === true) {
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
    const profile = hookProfile(hook);
    const ruleId = missingScriptRuleId(profile);
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
