import type { HookFactSource, HookSchemaProfile } from "./hook-profiles";
import type { HookDefect, HookDefectDetail } from "./hook-schema";
import type {
  McpLaunchKind,
  McpSchemaProfile,
  Provider,
  SkillSchemaProfile,
} from "./provider";

export type { HookSchemaProfile } from "./hook-profiles";
export type { HookDefect, HookDefectDetail, HookHandlerType } from "./hook-schema";
export type {
  McpLaunchKind,
  McpSchemaProfile,
  Provider,
  SkillSchemaProfile,
} from "./provider";

export type YamlScalarKind = "string" | "number" | "boolean" | "other";
export type OsPlatform = "windows" | "linux" | "osx";

export type SkillFact = {
  id: string;
  sourceProvider: Provider;
  /** File-schema contract. Distinct from product identity — `.cursor/skills` is Agent Skills. */
  schemaProfile: SkillSchemaProfile;
  /** Stable path-qualified identity only when duplicate ids are present. */
  instanceId?: string;
  path: string;
  description?: string;
  source: "project" | "global";
  hasSkillMd: boolean;
  hasFrontmatter: boolean;
  /** SKILL.md exists but could not be read; frontmatter facts are unknown. */
  unreadable?: boolean;
  /** A `---` block exists but does not parse; its fields are unknown. */
  unparseableFrontmatter?: boolean;
  brokenReferences?: string[];
  frontmatterName?: string;
  nameKind?: YamlScalarKind;
  descriptionKind?: YamlScalarKind;
  whenToUse?: string;
  /** First non-empty body line after frontmatter, used when Claude omits description. */
  firstNonEmptyLine?: string;
  bodyLines?: number;
  compatibility?: string;
  compatibilityKind?: YamlScalarKind;
  compatibilityInvalid?: boolean;
  metadataInvalid?: boolean;
  allowedTools?: string;
  allowedToolsKind?: YamlScalarKind;
  allowedToolsInvalid?: boolean;
  /**
   * Hooks declared in this file's own frontmatter, one of the seven documented
   * registration sites. Kept on the item because that is where the base for a
   * relative script path lives. See docs/spec/hook-sources.md.
   */
  frontmatterHooks?: HookFact[];
  /**
   * Layer precedence. `true` is currently loaded; `false` is readable but
   * shadowed by a higher-precedence layer. Unset means the item is not ranked.
   */
  effective?: boolean;
};

export type McpFact = {
  name: string;
  path: string;
  schemaProfile: McpSchemaProfile;
  sourceProvider: Provider;
  /** Providers that honestly consume this path's schema. Shared `.mcp.json` lists both. */
  consumedBy?: Provider[];
  transportField?: "transport" | "type";
  commandcodeDefect?: CommandcodeMcpDefect;
  /** Array item from `mcp.servers` with no `name` — inventoried, not schema-checked. */
  inventoryOnly?: boolean;
  launchKind?: McpLaunchKind;
  /** Continue registry block, e.g. `continuedev/continue-docs-mcp`. */
  uses?: string;
  platform?: OsPlatform;
  cwd?: string;
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
  /**
   * `headers` / `http_headers` / `auth` field paths whose values look like
   * literal secrets rather than interpolation. Paths only — never values.
   * See docs/spec/mcp.md and `mcp.literal-credential`.
   */
  literalCredentialFields?: string[];
  /** Label of the first secret shape found in the entry (never the value). */
  secretLabel?: string;
  /**
   * Layer precedence: Command Code ranks settings / user mcp.json / project
   * `.mcp.json` (nested `.mcp.json` is Claude's file, unranked); Grok ranks
   * walked `.grok/config.toml` files and the user file. `false` is shadowed.
   */
  effective?: boolean;
  /**
   * Claude `~/.claude.json` layer. Top-level `mcpServers` is user scope;
   * `projects.<path>.mcpServers` is local scope for one project.
   * Same-name user and local entries stay distinct. See docs/spec/mcp.md.
   */
  claudeMcpLayer?: "user" | "local";
};

export type HookFact = {
  path: string;
  event: string;
  command?: string;
  /**
   * Which of the documented hook locations declared it. A finding has to name
   * the file, and "PreToolUse" alone does not tell a reader whether to open a
   * settings file, a plugin manifest or a SKILL.md.
   *
   * See docs/spec/hook-sources.md.
   */
  source?: HookFactSource;
  sourceProvider: Provider;
  schemaProfile: HookSchemaProfile;
  handlerType?: "command" | "http" | "mcp_tool" | "prompt" | "agent";
  defect?: HookDefect;
  defectDetail?: HookDefectDetail;
  timeout?: number;
  timeoutOutOfBounds?: boolean;
  unknownHandlerType?: string;
  platform?: OsPlatform;
  cwd?: string;
  scriptPath?: string;
  scriptExists?: boolean;
  commandcodeSettingsLayer?: "local" | "project" | "user";
  effective?: boolean;
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
  sourceProvider: Provider;
  schemaProfile?: AgentSchemaProfile;
  /** One `.claude/agents` (or provider) directory — duplicates are scoped here. */
  namespace?: string;
  nameSource?: "frontmatter" | "filename";
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
  /** Codex `.codex/agents/*.toml`: required string fields that are absent or not strings. */
  codexMissingFields?: string[];
  invalidField?: string;
  effective?: boolean;
};

/** Custom slash command markdown. Inventory for Command Code and Claude. */
export type SlashCommandFact = {
  name: string;
  path: string;
  source: "project" | "global";
  sourceProvider: Provider;
  /** Claude command files use the skill hook shape. See docs/spec/skills.md. */
  frontmatterHooks?: HookFact[];
};

/** A config file agentscan could not read — itself a finding, never swallowed. */
export type ConfigErrorFact = {
  path: string;
  /**
   * `truncated` is not a defect in the file — it says agentscan read only a
   * bounded prefix of it, so body-reading checks may undercount. It reports at
   * info through `scan.truncated`; the rest are `config.unreadable`, at info
   * for `permission-denied` (EACCES/EPERM says nothing about the file itself).
   */
  kind: "invalid-json" | "unreadable" | "permission-denied" | "unexpected-shape" | "truncated";
  detail: string;
};

/** One entry of skills-lock.json. */
export type LockedSkillFact = {
  id: string;
  source?: string;
  skillPath?: string;
  computedHash?: string;
  lockRoot?: string;
  lockPath?: string;
  /** A project skill dir beside the lockfile holds `<id>/SKILL.md`, even where the skill walk does not reach. */
  installedBesideLock?: boolean;
};

export type PolicyFileFact = {
  path: string;
  text: string;
  sourceProvider?: Provider;
  kind?: "agents-md" | "claude-md" | "vscode-instructions";
  hopsFromStart?: number;
  nearest?: boolean;
};

/** Windsurf rule scope. See docs/spec/windsurf-rules.md. */
export type WindsurfRuleScope = "workspace" | "global" | "legacy";

/**
 * One defect on a modular Antigravity rule. Unreadable YAML is a config
 * error and leaves this unset. See docs/spec/antigravity-rules.md.
 */
export type AntigravityRuleDefect =
  | "missing-trigger"
  | "invalid-trigger"
  | "missing-description"
  | "missing-globs";

export type RuleFact = {
  path: string;
  sourceProvider: Provider;
  lineCount: number;
  byteLength: number;
  /** UTF-16 code units of the scanned prefix. Windsurf budgets are character counts. */
  charCount: number;
  windsurfScope?: WindsurfRuleScope;
  /**
   * Workspace `.devin` / `.windsurf` rules only: whether frontmatter sets
   * `trigger`. `unreadable` means the YAML did not parse, so do not claim it is missing.
   */
  windsurfTrigger?: "yes" | "no" | "unreadable";
  /** Modular `.agents/rules` and `~/.gemini/config/rules` files only. */
  antigravityDefect?: AntigravityRuleDefect;
};

/** Everything discovery reads from the agent configuration of one scan. */
export type AgentSurface = {
  skills: SkillFact[];
  agents: AgentFact[];
  hooks: HookFact[];
  mcp: McpFact[];
  policyFiles: PolicyFileFact[];
  rules?: RuleFact[];
  lockedSkills: LockedSkillFact[];
  hasSkillsLock: boolean;
  skillsLockInvalid?: boolean;
  /** Dirs of the valid skills-lock.json files; each governs the skills under it. */
  skillLockRoots: string[];
  configErrors: ConfigErrorFact[];
  codexProjectDocMaxBytes: number;
  /**
   * The instruction files Codex concatenates from its project root down to
   * cwd, at most one per directory. See docs/spec/codex-agents-md.md.
   */
  codexInstructionChain: PolicyFileFact[];
};

/** The scan snapshot every check reads: package facts plus the agent surface. */
export type Facts = AgentSurface & {
  root: string;
  packageManager: "bun" | "npm" | "pnpm" | "yarn" | "unknown";
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};
