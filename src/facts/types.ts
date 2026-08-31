import type { HookSchemaProfile } from "./hook-schema";
import type {
  McpLaunchKind,
  McpSchemaProfile,
  Provider,
  SkillSchemaProfile,
} from "./provider";

export type Action = "keep" | "delete" | "add" | "refresh" | "warn" | "drift";
export type Severity = "error" | "warning" | "info";

export type { HookHandlerType, HookSchemaProfile } from "./hook-schema";
export type {
  McpLaunchKind,
  McpSchemaProfile,
  Provider,
  SkillSchemaProfile,
} from "./provider";

export type YamlScalarKind = "string" | "number" | "boolean" | "other";
export type HookDefect =
  | "invalid-group"
  | "command-without-command"
  | "http-without-url"
  | "mcp-tool-without-server-or-tool"
  | "prompt-without-prompt"
  | "unknown-handler-type"
  | "incompatible-handler";
export type OsPlatform = "windows" | "linux" | "osx";

export type SkillFact = {
  id: string;
  /** Provider convention that owns this skill directory. */
  sourceProvider?: Provider;
  /** File-schema contract. Distinct from product identity — `.cursor/skills` is Agent Skills. */
  schemaProfile?: SkillSchemaProfile;
  /** Stable path-qualified identity only when duplicate ids are present. */
  instanceId?: string;
  path: string;
  description?: string;
  source: "project" | "global";
  /** SKILL.md present in the skill dir. */
  hasSkillMd: boolean;
  /** Frontmatter present and parseable as a `---` block. */
  hasFrontmatter: boolean;
  /** SKILL.md exists but could not be read; frontmatter facts are unknown. */
  unreadable?: boolean;
  /** A `---` block exists but does not parse; its fields are unknown. */
  unparseableFrontmatter?: boolean;
  /** Bundled files the body points at that resolve nowhere. */
  brokenReferences?: string[];
  /** `name:` from frontmatter, when present as a string. */
  frontmatterName?: string;
  /** YAML type of `name:` before any string coercion. */
  nameKind?: YamlScalarKind;
  /** YAML type of `description:` before any string coercion. */
  descriptionKind?: YamlScalarKind;
  /** Frontmatter `when_to_use`, when present as a string. */
  whenToUse?: string;
  /** First markdown paragraph after frontmatter, used when Claude omits description. */
  firstMarkdownParagraph?: string;
  /** Whole-file line count of SKILL.md, when the file was readable. */
  bodyLines?: number;
  /** Optional Agent Skills `compatibility` string, when present. */
  compatibility?: string;
  compatibilityKind?: YamlScalarKind;
  /** True when `compatibility` is present but not a 1..500 character string. */
  compatibilityInvalid?: boolean;
  /** True when `metadata` is present but is not map<string, string>. */
  metadataInvalid?: boolean;
  /** Optional Agent Skills `allowed-tools` string, when present. */
  allowedTools?: string;
  allowedToolsKind?: YamlScalarKind;
  /** True when `allowed-tools` is present but is not a string. */
  allowedToolsInvalid?: boolean;
  /**
   * Hooks declared in this file's own frontmatter, one of the seven documented
   * registration sites. Kept on the item because that is where the base for a
   * relative script path lives. See docs/spec/hook-sources.md.
   */
  frontmatterHooks?: HookFact[];
  /**
   * Command Code load rank. `true` is currently loaded; `false` is readable but
   * shadowed by a higher-precedence source. Unset means this is not a Command
   * Code-ranked skill.
   */
  commandcodeEffective?: boolean;
};

export type McpFact = {
  name: string;
  path: string;
  schemaProfile?: McpSchemaProfile;
  sourceProvider?: Provider;
  /** Providers that honestly consume this path's schema. Shared `.mcp.json` lists both. */
  consumedBy?: Provider[];
  /** Which JSON key supplied `transport`, when either is present. */
  transportField?: "transport" | "type";
  commandcodeDefect?: CommandcodeMcpDefect;
  /** Array item from `mcp.servers` with no `name` — inventoried, not schema-checked. */
  inventoryOnly?: boolean;
  launchKind?: McpLaunchKind;
  /** Continue registry block, e.g. `continuedev/continue-docs-mcp`. */
  uses?: string;
  platform?: OsPlatform;
  /** Declared working directory when present. */
  cwd?: string;
  /** OpenCode V1 vs V2 map that produced this entry. */
  opencodeSchema?: "v1" | "v2";
  /**
   * V1 `{ enabled }` override that may inherit a server defined outside this
   * file. Skip hard launch/schema errors — the launch data is not local.
   */
  opencodeInherit?: boolean;
  opencodeDefect?:
    | "missing-type"
    | "local-without-command"
    | "remote-without-url"
    | "invalid-launch-for-type"
    | "command-not-array";
  /**
   * Standalone Continue YAML block under `.continue/mcpServers/` is missing
   * required `name`, `version`, or `schema` on the document. Copied JSON MCP
   * configs in the same directory must not set this.
   */
  continueMissingMetadataKeys?: string[];
  hasCommand: boolean;
  hasUrl: boolean;
  hasServerUrl?: boolean;
  hasHttpUrl?: boolean;
  /** Declared `command` string when present (stdio servers). */
  command?: string;
  /**
   * false only when `command` was a resolvable path-like value and that path
   * does not exist on disk. Absent when the command is a bare PATH binary or
   * otherwise not honestly resolvable — same discipline as hook.scriptExists.
   */
  commandExists?: boolean;
  /** Declared transport, if any: http | sse | ws | stdio. */
  transport?: string;
  /** env values that look like literal secrets rather than ${VAR} refs. */
  literalEnvKeys: string[];
  /** Raw entry text, for secret pattern matching. */
  raw: string;
  /**
   * Command Code MCP load rank among settings / user mcp.json / project
   * `.mcp.json`. Unset means this is not a Command Code-ranked MCP source
   * (nested `.mcp.json` is Claude's file, not Command Code project MCP).
   */
  commandcodeEffective?: boolean;
};

export type HookFact = {
  name: string;
  path: string;
  event?: string;
  command?: string;
  /**
   * Which of the documented hook locations declared it. A finding has to name
   * the file, and "PreToolUse" alone does not tell a reader whether to open a
   * settings file, a plugin manifest or a SKILL.md.
   *
   * See docs/spec/hook-sources.md.
   */
  source?: "settings" | "plugin" | "skill" | "agent" | "vscode-hooks";
  sourceProvider?: Provider;
  schemaProfile?: HookSchemaProfile;
  handlerType?: "command" | "http" | "mcp_tool" | "prompt" | "agent";
  defect?: HookDefect;
  /** Declared timeout in seconds, when present and numeric. */
  timeout?: number;
  timeoutOutOfBounds?: boolean;
  unknownHandlerType?: string;
  platform?: OsPlatform;
  /** Declared working directory when present. */
  cwd?: string;
  /** Script path parsed out of `command`, resolved against the project root. */
  scriptPath?: string;
  /** false only when scriptPath was extracted and does not exist on disk. */
  scriptExists?: boolean;
  /** Settings layer that declared this Command Code hook. */
  commandcodeSettingsLayer?: "local" | "project" | "user";
  commandcodeEffective?: boolean;
  /** `matcher` was present but was not a string. */
  commandcodeInvalidMatcher?: boolean;
};

export type AgentSchemaProfile = "claude-md" | "vscode-agent-md" | "commandcode-md";

export type CommandcodeAgentDefect =
  | "reserved-name"
  | "invalid-permission-mode"
  | "invalid-field-type";

export type CommandcodeMcpDefect =
  | "invalid-transport"
  | "http-without-url"
  | "stdio-without-command";

export type AgentFact = {
  name: string;
  path: string;
  sourceProvider?: Provider;
  schemaProfile?: AgentSchemaProfile;
  /** One `.claude/agents` (or provider) directory — duplicates are scoped here. */
  namespace?: string;
  nameSource?: "frontmatter" | "filename";
  /** Frontmatter present and parseable as a `---` block. */
  hasFrontmatter: boolean;
  /** File exists but could not be read; its fields are unknown, not absent. */
  unreadable?: boolean;
  /** A `---` block exists but does not parse; its fields are unknown. */
  unparseableFrontmatter?: boolean;
  /**
   * `name:` from frontmatter — a display name. Deliberately NOT compared to the
   * filename: 16 of 34 real agent files differ intentionally and nothing keys
   * on the filename. See plans/003 and docs/spec/skills.md.
   */
  frontmatterName?: string;
  description?: string;
  /** Hooks declared in this agent's frontmatter. See docs/spec/hook-sources.md. */
  frontmatterHooks?: HookFact[];
  permissionMode?: string;
  commandcodeDefects?: CommandcodeAgentDefect[];
  invalidField?: string;
  commandcodeEffective?: boolean;
};

/** Custom slash command markdown. Inventory only for Command Code. */
export type SlashCommandFact = {
  name: string;
  path: string;
  source: "project" | "global";
  sourceProvider: Provider;
};

/** Declared mod path. Experimental inventory — never executed. */
export type ModFact = {
  path: string;
  declaredFrom: string;
  sourceProvider: Provider;
};

/** A config file agentscan could not read — itself a finding, never swallowed. */
export type ConfigErrorFact = {
  path: string;
  /**
   * `truncated` is not a defect in the file — it says agentscan read only a
   * bounded prefix of it, so body-reading checks may undercount. It reports at
   * info through `scan.truncated`; the other three are `config.unreadable`.
   */
  kind: "invalid-json" | "unreadable" | "unexpected-shape" | "truncated";
  detail: string;
};

/** One entry of skills-lock.json. */
export type LockedSkillFact = {
  id: string;
  source?: string;
  skillPath?: string;
  computedHash?: string;
  /** Directory that contains the lockfile governing this entry. */
  lockRoot?: string;
  lockPath?: string;
};

export type PolicyFileFact = {
  path: string;
  text: string;
  sourceProvider?: Provider;
  kind?: "agents-md" | "claude-md" | "vscode-instructions";
  hopsFromStart?: number;
  nearest?: boolean;
};

export type RuleFact = {
  path: string;
  sourceProvider: Provider;
  lineCount: number;
  byteLength: number;
};

export type Facts = {
  root: string;
  /** Directory the user asked to scan; walk-up discovery starts here. */
  startDir?: string;
  /** Farthest ancestor this scan may walk. A child `.cursor` does not shrink it. */
  scanBoundary?: string;
  /**
   * Command Code project root (git root, or the working directory outside a
   * git repo). Settings, hooks path bases, inline MCP, extra skills, and
   * model/mod settings resolve against this, not the generic `projectRoot`.
   */
  commandcodeProjectRoot?: string;
  /** Codex `project_doc_max_bytes` when declared in `.codex/config.toml`. */
  codexProjectDocMaxBytes?: number;
  /** Codex `project_doc_fallback_filenames` from `.codex/config.toml`. */
  codexProjectDocFallbackFilenames?: string[];
  /**
   * Codex `project_root_markers` from `.codex/config.toml`. `undefined` means
   * the documented default (`.git`). An empty array means cwd is the project
   * root. See docs/spec/codex-agents-md.md.
   */
  codexProjectRootMarkers?: string[];
  /** Resolved Codex project root for the root→cwd instruction chain. */
  codexProjectRoot?: string;
  packageManager: "bun" | "npm" | "pnpm" | "yarn" | "unknown";
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  skills: SkillFact[];
  agents: AgentFact[];
  hooks: HookFact[];
  mcp: McpFact[];
  policyFiles: PolicyFileFact[];
  rules?: RuleFact[];
  slashCommands?: SlashCommandFact[];
  mods?: ModFact[];
  /** Winning Command Code settings `model`, when a settings file declares one. */
  commandcodeModel?: string;
  commandcodeModelSource?: string;
  /** skills-lock.json entries; empty when the project has no lockfile. */
  lockedSkills: LockedSkillFact[];
  hasSkillsLock: boolean;
  skillsLockInvalid?: boolean;
  /** Directories that own a readable skills-lock.json in this scan. */
  skillLockRoots?: string[];
  configErrors: ConfigErrorFact[];
};

export type Finding = {
  id: string; // stable: `${ruleId}:${subject}`
  ruleId: string;
  action: Action;
  severity: Severity;
  subject: string; // e.g. skill:next-cache-components
  message: string;
  reason: string;
  evidence: { kind: string; value: string }[];
  suggest?: string;
};
