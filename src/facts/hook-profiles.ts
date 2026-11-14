import {
  COMMANDCODE_HOOK_EVENTS,
  COMMANDCODE_HOOK_TIMEOUT_MAX,
  COMMANDCODE_HOOK_TIMEOUT_MIN,
} from "./commandcode";
import { CURSOR_HOOK_EVENTS } from "./cursor";
import { GEMINI_HOOK_EVENTS } from "./gemini";
import { GROK_HOOK_EVENTS } from "./grok";
import { ANTIGRAVITY_HOOK_EVENTS } from "./antigravity";
import { CODEX_HOOK_EVENTS, CODEX_SHORT_TIMEOUT_MAX, CODEX_SHORT_TIMEOUT_MIN } from "./codex";
import {
  COPILOT_HOOK_EVENTS,
  KNOWN_HOOK_EVENTS,
  VSCODE_HOOK_EVENTS,
  type HookDefect,
  type HookDefectDetail,
  type HookHandlerType,
} from "./hook-schema";
import { DEVIN_HOOK_EVENTS } from "./devin";
import { KIRO_HOOK_EVENTS } from "./kiro";
import { WINDSURF_HOOK_EVENTS } from "./windsurf";
import { QWEN_HOOK_EVENTS } from "./qwen";

export type HookRuleKind = HookDefect | "unknown-event" | "missing-script" | "timeout-out-of-bounds";

/**
 * How a profile's document is shaped.
 * `nested` and `flat-array` go through `hooksFromObject`.
 * `event-keyed` is Cursor and Windsurf (`readFlatHooks`).
 * `own` is a reader that does not share either pipeline (Kiro).
 */
export type HookLayout = "nested" | "flat-array" | "event-keyed" | "own";

/**
 * Everything one hook schema profile needs: its event set, rule id prefix,
 * which shape defects it reports, and its wording where it differs.
 */
export type HookProfileSpec = {
  events: ReadonlySet<string>;
  ruleIdPrefix: string;
  defects: readonly HookDefect[];
  messages?: Partial<
    Record<
      HookDefect,
      (
        event: string,
        detail: HookDefectDetail | undefined,
        handlerType: HookHandlerType | undefined,
      ) => string | undefined
    >
  >;
  layout: HookLayout;
  /** Source string this profile writes on facts that come from its own file. */
  fileSource?: string;
  /** Closed timeout range and why; only the profiles that document one. */
  timeout?: { min: number; max: number; reason: string };
  /** `invalid-group` facts carry a synthetic event name; never validate it as an event. */
  invalidGroupHasNoEvent?: true;
};

export const PROFILES = {
  claude: {
    events: KNOWN_HOOK_EVENTS,
    ruleIdPrefix: "claude",
    defects: [
      "invalid-group",
      "command-without-command",
      "http-without-url",
      "mcp-tool-without-server-or-tool",
      "prompt-without-prompt",
      "unknown-handler-type",
      "incompatible-handler",
    ],
    layout: "nested",
  },
  "vscode-native": {
    events: VSCODE_HOOK_EVENTS,
    ruleIdPrefix: "vscode",
    defects: ["invalid-group", "command-without-command", "unknown-handler-type"],
    layout: "flat-array",
    fileSource: "vscode-hooks",
  },
  "copilot-cli": {
    events: COPILOT_HOOK_EVENTS,
    ruleIdPrefix: "copilot",
    defects: [
      "command-without-command",
      "http-without-url",
      "prompt-without-prompt",
      "unknown-handler-type",
      "incompatible-handler",
    ],
    messages: {
      "command-without-command": (event) =>
        `${event} command hook declares none of bash, powershell, command, or exec`,
    },
    layout: "flat-array",
    fileSource: "copilot-settings",
  },
  commandcode: {
    events: COMMANDCODE_HOOK_EVENTS,
    ruleIdPrefix: "commandcode",
    defects: ["invalid-group", "command-without-command", "unknown-handler-type"],
    messages: {
      "invalid-group": (event, detail) =>
        detail === "matcher-not-string" ? `${event} hook matcher is not a string` : undefined,
    },
    timeout: {
      min: COMMANDCODE_HOOK_TIMEOUT_MIN,
      max: COMMANDCODE_HOOK_TIMEOUT_MAX,
      reason: `Command Code hook timeouts are seconds in the closed range ${COMMANDCODE_HOOK_TIMEOUT_MIN}–${COMMANDCODE_HOOK_TIMEOUT_MAX}. A value outside that range is not a valid timeout. See docs/spec/commandcode-hooks.md.`,
    },
    layout: "nested",
  },
  grok: {
    events: GROK_HOOK_EVENTS,
    ruleIdPrefix: "grok",
    defects: ["invalid-group", "command-without-command", "http-without-url", "unknown-handler-type"],
    layout: "nested",
    fileSource: "grok-hooks",
  },
  windsurf: {
    events: WINDSURF_HOOK_EVENTS,
    ruleIdPrefix: "windsurf",
    defects: ["command-without-command"],
    messages: {
      "command-without-command": (event) => `${event} hook declares neither command nor powershell`,
    },
    layout: "event-keyed",
    fileSource: "windsurf-hooks",
  },
  devin: {
    events: DEVIN_HOOK_EVENTS,
    ruleIdPrefix: "devin",
    defects: [
      "invalid-group",
      "command-without-command",
      "prompt-without-prompt",
      "unknown-handler-type",
    ],
    layout: "nested",
    fileSource: "devin-hooks",
  },
  /**
   * Nested groups in `hooks.json` or `[hooks]` in `config.toml`.
   * `prompt` and `agent` are parsed but not run. `SessionEnd` does not run
   * `mcp_tool`. The timeout range is only SessionEnd and Interrupt; the
   * reader sets `timeoutOutOfBounds` for those two. See docs/spec/codex-hooks.md.
   */
  codex: {
    events: CODEX_HOOK_EVENTS,
    ruleIdPrefix: "codex",
    defects: [
      "invalid-group",
      "command-without-command",
      "mcp-tool-without-server-or-tool",
      "unknown-handler-type",
      "incompatible-handler",
    ],
    messages: {
      "incompatible-handler": (event, _detail, handlerType) =>
        handlerType === "mcp_tool"
          ? `${event} does not run mcp_tool handlers`
          : `${event} ${handlerType ?? "prompt"} handler is parsed but skipped`,
    },
    timeout: {
      min: CODEX_SHORT_TIMEOUT_MIN,
      max: CODEX_SHORT_TIMEOUT_MAX,
      reason: `Codex SessionEnd and Interrupt timeouts are seconds in the closed range ${CODEX_SHORT_TIMEOUT_MIN}–${CODEX_SHORT_TIMEOUT_MAX}. Other events default to 600 seconds and have no quoted maximum, so they are not checked. See docs/spec/codex-hooks.md.`,
    },
    layout: "nested",
    fileSource: "codex-hooks",
  },
  gemini: {
    events: GEMINI_HOOK_EVENTS,
    ruleIdPrefix: "gemini",
    defects: ["invalid-group", "command-without-command", "unknown-handler-type"],
    layout: "nested",
    fileSource: "gemini-settings",
  },
  cursor: {
    events: CURSOR_HOOK_EVENTS,
    ruleIdPrefix: "cursor",
    // Cursor documents flat arrays, so there is no group to be invalid,
    // and none of the Claude handler kinds exist here.
    defects: ["command-without-command", "unknown-handler-type"],
    layout: "event-keyed",
    fileSource: "cursor-hooks",
  },
  /**
   * Name-keyed `.agents/hooks.json`. Direct `{ type?, command }` handlers are
   * valid; only a matcher group needs a `hooks` array. `type` defaults to
   * `command`. No quoted timeout range. See docs/spec/antigravity-hooks.md.
   */
  antigravity: {
    events: ANTIGRAVITY_HOOK_EVENTS,
    ruleIdPrefix: "antigravity",
    defects: ["invalid-group", "command-without-command", "unknown-handler-type"],
    messages: {
      "invalid-group": (event, detail) =>
        detail === "matcher-not-string" ? `${event} hook matcher is not a string` : undefined,
    },
    layout: "own",
    fileSource: "antigravity-hooks",
  },
  kiro: {
    events: KIRO_HOOK_EVENTS,
    ruleIdPrefix: "kiro",
    defects: ["invalid-group", "command-without-command", "prompt-without-prompt", "unknown-handler-type"],
    messages: {
      "invalid-group": (_event, detail) => {
        switch (detail) {
          case "missing-hooks":
            return "Kiro hook file is missing a `hooks` array";
          case "missing-version-and-hooks":
            return 'Kiro hook file is missing version "v1" and a `hooks` array';
          case "entry":
            return "Kiro hook entry is not an object";
          case "missing-version":
            return 'Kiro hook file is missing version "v1"';
          default:
            return 'Kiro hook file is missing version "v1" or a `hooks` array';
        }
      },
    },
    layout: "own",
    fileSource: "kiro-hooks",
    invalidGroupHasNoEvent: true,
  },
  /**
   * `hooks` in `.qwen/settings.json`, Claude-style groups. The inner `hooks`
   * array is not marked required, so no `invalid-group`. Timeout is seconds
   * with no quoted range. See docs/spec/qwen-hooks.md.
   */
  qwen: {
    events: QWEN_HOOK_EVENTS,
    ruleIdPrefix: "qwen",
    defects: ["command-without-command", "http-without-url", "unknown-handler-type"],
    layout: "nested",
    fileSource: "qwen-settings",
  },
} as const satisfies Record<string, HookProfileSpec>;

/**
 * File-schema contract for a hooks object: one row of the table above.
 * Distinct from `sourceProvider`: `.github/hooks` is always VS Code-owned, but
 * `version: 1` is Copilot CLI. See docs/spec/hook-events.md,
 * docs/spec/vscode-hooks.md, docs/spec/copilot-hooks.md.
 */
export type HookSchemaProfile = keyof typeof PROFILES;

export const HOOK_PROFILES: Record<HookSchemaProfile, HookProfileSpec> = PROFILES;

type Profiles = typeof PROFILES;

type LayoutOf<P extends HookSchemaProfile> = Profiles[P]["layout"];

export type EventKeyedProfile = {
  [P in HookSchemaProfile]: LayoutOf<P> extends "event-keyed" ? P : never;
}[HookSchemaProfile];

export type OwnHookProfile = {
  [P in HookSchemaProfile]: LayoutOf<P> extends "own" ? P : never;
}[HookSchemaProfile];

/** Profiles whose reader is not `hooksFromObject`. */
export type FlatHookProfile = EventKeyedProfile | OwnHookProfile;

export type PipedProfile = {
  [P in HookSchemaProfile]: LayoutOf<P> extends "nested" | "flat-array" ? P : never;
}[HookSchemaProfile];

type ProfileFileSource = {
  [P in HookSchemaProfile]: Profiles[P] extends { fileSource: infer S } ? S : never;
}[HookSchemaProfile];

/** Location kinds plus each profile's own file source. Adding a profile extends this. */
export type HookFactSource = ProfileFileSource | "settings" | "plugin" | "skill" | "agent";

/**
 * Every id the table can build: per profile, its prefix with `unknown-event`,
 * `missing-script`, its declared defects, and `timeout-out-of-bounds` when it
 * has a timeout. `make()` accepts only ids present in the registry.
 */
export type HookRuleId = {
  [P in HookSchemaProfile]: `${Profiles[P]["ruleIdPrefix"]}.hook.${
    | "unknown-event"
    | "missing-script"
    | Profiles[P]["defects"][number]
    | (Profiles[P] extends { timeout: object } ? "timeout-out-of-bounds" : never)}`;
}[HookSchemaProfile];

/**
 * The one place hook rule ids are built.
 * The return type is every profile's ids, not this profile's. Callers only pass
 * a `kind` the profile declares, and `make()` throws if the id is not registered.
 */
export function hookRuleId(profile: HookSchemaProfile, kind: HookRuleKind): HookRuleId {
  return `${HOOK_PROFILES[profile].ruleIdPrefix}.hook.${kind}` as HookRuleId;
}
