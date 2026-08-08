export type Action = "keep" | "delete" | "add" | "refresh" | "warn" | "drift";
export type Severity = "error" | "warning" | "info";

export type SkillFact = {
  id: string;
  path: string;
  description?: string;
  source: "project" | "global";
  mtimeMs?: number;
  tags?: string[];
  /** SKILL.md present in the skill dir. */
  hasSkillMd: boolean;
  /** Frontmatter present and parseable as a `---` block. */
  hasFrontmatter: boolean;
  /** `name:` from frontmatter, when present. */
  frontmatterName?: string;
};

export type McpFact = {
  name: string;
  path: string;
  hasCommand: boolean;
  hasUrl: boolean;
  /** env values that look like literal secrets rather than ${VAR} refs. */
  literalEnvKeys: string[];
  /** Raw entry text, for secret pattern matching. */
  raw: string;
};

export type HookFact = {
  name: string;
  path: string;
  event?: string;
  command?: string;
  /** Script path parsed out of `command`, resolved against the project root. */
  scriptPath?: string;
  /** false only when scriptPath was extracted and does not exist on disk. */
  scriptExists?: boolean;
};

export type AgentFact = { name: string; path: string };

/** A config file skillscan could not read — itself a finding, never swallowed. */
export type ConfigErrorFact = {
  path: string;
  kind: "invalid-json" | "unreadable" | "unexpected-shape";
  detail: string;
};

/** One entry of skills-lock.json. */
export type LockedSkillFact = {
  id: string;
  source?: string;
  skillPath?: string;
  computedHash?: string;
};

export type Facts = {
  root: string;
  packageManager: "bun" | "npm" | "pnpm" | "yarn" | "unknown";
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  /** Optional; only if lockfile parse is cheap and reliable */
  resolvedVersions?: Record<string, string>;
  scripts: Record<string, string>;
  configs: {
    next?: { cacheComponents?: boolean; appRouter?: boolean };
    shadcn?: boolean;
    ultracite?: boolean;
    biome?: boolean;
  };
  skills: SkillFact[];
  agents: AgentFact[];
  hooks: HookFact[];
  mcp: McpFact[];
  policyFiles: { path: string; text: string }[];
  /** skills-lock.json entries; empty when the project has no lockfile. */
  lockedSkills: LockedSkillFact[];
  hasSkillsLock: boolean;
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
