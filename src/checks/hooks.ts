import { isShadowed } from "../facts/precedence";
import { HOOK_PROFILES, hookRuleId, type HookRuleId, type HookSchemaProfile } from "../facts/hook-profiles";
import { assertNever } from "../facts/provider";
import type { Facts, HookDefect, HookFact } from "../facts/types";
import type { Finding } from "../findings";
import { make } from "./make";

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
    if (isShadowed(hook)) {
      continue;
    }
    const profile = hook.schemaProfile;
    // A synthetic event name on a file-level defect would invent a second
    // finding about a name the file never declared.
    if (hook.defect === "invalid-group" && HOOK_PROFILES[profile].invalidGroupHasNoEvent === true) {
      continue;
    }
    const ruleId = hookRuleId(profile, "unknown-event");
    const event = hook.event;
    const key = `${profile}:${event}`;
    const known = HOOK_PROFILES[profile].events;
    if (known.has(event) || reported.has(key)) {
      continue;
    }
    reported.add(key);
    // Copilot CLI documents camelCase names; a PascalCase twin is a likely casing slip.
    const recased = `${event.charAt(0).toLowerCase()}${event.slice(1)}`;
    const casingSlip = profile === "copilot-cli" && recased !== event && known.has(recased);
    const args: Pick<Finding, "message" | "reason" | "evidence" | "suggest"> = {
      message: casingSlip
        ? `"${event}" is not a documented Copilot CLI hook event; the documented name is "${recased}"`
        : `"${event}" is not a hook event that gets dispatched`,
      reason:
        "Hook events are matched by exact name. An unrecognised name never matches, so everything registered under it silently never runs — a typo here looks identical to a working hook. Event sets are per schema profile; a VS Code name is not validated against Claude's list, and Copilot CLI camelCase names map onto VS Code events where the Copilot hooks reference documents that mapping.",
      evidence: [
        { kind: "hook", value: `${event} @ ${hook.path}` },
        {
          kind: "known",
          value: [...known].join(", "),
        },
      ],
      suggest: casingSlip
        ? `Rename "${event}" to "${recased}" in ${hook.path}`
        : `Fix the event name in ${hook.path} (or ignoreRules: ["${ruleId}"] if it is newly supported)`,
    };
    out.push(
      ruleId === "copilot.hook.unknown-event"
        ? make(ruleId, `hook:${event}`, { ...args, severity: casingSlip ? "warning" : "error" })
        : make(ruleId, `hook:${event}`, args),
    );
  }
  return out;
}

function defectRuleId(profile: HookSchemaProfile, defect: HookDefect): HookRuleId | undefined {
  return HOOK_PROFILES[profile].defects.includes(defect) ? hookRuleId(profile, defect) : undefined;
}

function defectMessage(hook: HookFact, defect: HookDefect): string {
  const event = hook.event;
  const override = HOOK_PROFILES[hook.schemaProfile].messages?.[defect]?.(
    event,
    hook.defectDetail,
    hook.handlerType,
  );
  if (override !== undefined) {
    return override;
  }
  switch (defect) {
    case "invalid-group":
      return `${event} hook group is missing a \`hooks\` array`;
    case "command-without-command":
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

function checkHookShape(facts: Facts): Finding[] {
  const out: Finding[] = [];
  const reported = new Set<string>();
  for (const hook of facts.hooks) {
    if (isShadowed(hook)) {
      continue;
    }
    const defect = hook.defect;
    if (defect === undefined) {
      continue;
    }
    const ruleId = defectRuleId(hook.schemaProfile, defect);
    if (ruleId === undefined) {
      continue;
    }
    const subject = `hook:${hook.event}${
      hook.unknownHandlerType === undefined ? "" : `:${hook.unknownHandlerType}`
    }`;
    const key = `${ruleId}:${subject}:${hook.path}`;
    if (reported.has(key)) {
      continue;
    }
    reported.add(key);
    out.push(
      make(ruleId, subject, {
        message: defectMessage(hook, defect),
        reason:
          "A hook entry that is missing its required fields, or that uses a handler type the event does not dispatch, never runs. The previous scanner rejected these shapes; accepting them silently hid dead configuration.",
        evidence: [
          { kind: "hook", value: `${hook.event} @ ${hook.path}` },
          { kind: "shape", value: defect },
        ],
        suggest: `Fix the ${hook.event} entry in ${hook.path}`,
      }),
    );
  }
  return out;
}

export function checkHooks(facts: Facts): Finding[] {
  const out: Finding[] = [...checkHookShape(facts)];
  // One HookFact per command occurrence, so the same guard under two matchers —
  // the canonical shape — produced two findings sharing one id, and `explain`
  // could reach only the first.
  const reported = new Set<string>();
  for (const hook of facts.hooks) {
    if (isShadowed(hook)) {
      continue;
    }
    const timeout = HOOK_PROFILES[hook.schemaProfile].timeout;
    if (timeout !== undefined && hook.timeoutOutOfBounds === true) {
      const ruleId = hookRuleId(hook.schemaProfile, "timeout-out-of-bounds");
      const range = `${timeout.min}–${timeout.max}`;
      const subject = `hook:${hook.event}:timeout`;
      const key = `${ruleId}:${subject}:${hook.path}`;
      if (!reported.has(key)) {
        reported.add(key);
        const bound = hook.timeout === undefined ? `not a number in ${range}` : String(hook.timeout);
        out.push(
          make(ruleId, subject, {
            message: `${hook.event} hook timeout is out of bounds (${bound}; want ${range} seconds)`,
            reason: timeout.reason,
            evidence: [
              { kind: "hook", value: `${hook.event} @ ${hook.path}` },
              { kind: "timeout", value: bound },
            ],
            suggest: `Set timeout to an integer from ${timeout.min} to ${timeout.max} in ${hook.path}`,
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
    const profile = hook.schemaProfile;
    const ruleId = hookRuleId(profile, "missing-script");
    const subject = `hook:${hook.event}:${hook.scriptPath}`;
    if (reported.has(`${ruleId}:${subject}`)) {
      continue;
    }
    reported.add(`${ruleId}:${subject}`);
    out.push(
      make(ruleId, subject, {
        message: `${hook.event} hook points at a script that does not exist: ${hook.scriptPath}`,
        reason:
          "The hook is registered but its script is missing, so it never runs. A guard hook that silently does nothing is worse than no hook — the config claims a protection that is not in effect. A relative path is looked for beside the file that declared it and at the project root; it is at neither. Non-command handlers (http, mcp_tool, prompt, agent) are not path-checked.",
        evidence: [
          { kind: "hook", value: `${hook.event} @ ${hook.path}` },
          { kind: "script", value: hook.scriptPath },
          ...(hook.source === undefined || hook.source === "settings"
            ? []
            : [{ kind: "source" as const, value: hook.source }]),
        ],
        suggest: `Restore ${hook.scriptPath} or remove the hook from ${hook.path}`,
      }),
    );
  }
  return out;
}
