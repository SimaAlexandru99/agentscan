export type Action = "keep" | "delete" | "add" | "refresh" | "warn" | "drift";
export type Severity = "error" | "warning" | "info";

export type SkillFact = {
  id: string;
  path: string;
  description?: string;
  source: "project" | "global";
  mtimeMs?: number;
  tags?: string[];
};

export type McpFact = { name: string; path: string; hasCommand: boolean };
export type HookFact = { name: string; path: string; event?: string };
export type AgentFact = { name: string; path: string };

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
