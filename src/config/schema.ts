import { z } from "zod";

export const defaultThresholds = {
  /** Bytes of skill name+description loaded at startup. The constraint is a
   *  character budget (~1-2% of the context window) shared across all skills;
   *  past it, descriptions are truncated and matching keywords are lost. */
  skillDescriptionBytes: 16_000,
  mcp: 5,
  agentsMdLines: 150,
  claudeMdLines: 200,
  agents: 8,
};

export const defaultConfig = {
  skillPaths: [".agents/skills", ".claude/skills", "skills", ".cursor/skills"],
  mcpPaths: [
    ".mcp.json",
    ".claude/mcp.json",
    "mcp.json",
    ".vscode/mcp.json",
    ".cursor/mcp.json",
    ".agents/mcp_config.json",
    ".codex/config.toml",
    ".gemini/settings.json",
    "opencode.json",
    "opencode.jsonc",
    ".opencode/opencode.json",
    ".opencode/opencode.jsonc",
    ".continue/config.yaml",
  ],
  policyFiles: ["AGENTS.md", "CLAUDE.md"],
  ignoreSkills: [] as string[],
  ignoreRules: [] as string[],
  ignoreFindings: [] as string[],
  failOn: "never" as const,
  includeGlobal: false,
  requireLock: false,
  thresholds: defaultThresholds,
};

const thresholdsSchema = z.object({
  skillDescriptionBytes: z
    .number()
    .int()
    .positive()
    .default(defaultThresholds.skillDescriptionBytes),
  /** @deprecated accepted for one release; no check consumes it. */
  skills: z.number().int().positive().optional(),
  mcp: z.number().int().positive().default(defaultThresholds.mcp),
  agentsMdLines: z
    .number()
    .int()
    .positive()
    .default(defaultThresholds.agentsMdLines),
  claudeMdLines: z
    .number()
    .int()
    .positive()
    .default(defaultThresholds.claudeMdLines),
  agents: z.number().int().positive().default(defaultThresholds.agents),
}).strict();

export const configSchema = z.object({
  skillPaths: z.array(z.string()).default(defaultConfig.skillPaths),
  mcpPaths: z.array(z.string()).default(defaultConfig.mcpPaths),
  policyFiles: z.array(z.string()).default(defaultConfig.policyFiles),
  ignoreSkills: z.array(z.string()).default([]),
  ignoreRules: z.array(z.string()).default([]),
  /** Exact finding ids, the same strings `agentscan explain` takes. */
  ignoreFindings: z.array(z.string()).default([]),
  failOn: z.enum(["never", "warning", "error"]).default("never"),
  includeGlobal: z.boolean().default(false),
  requireLock: z.boolean().default(false),
  thresholds: thresholdsSchema.default(defaultThresholds),
}).strict();

export type AgentscanConfig = z.infer<typeof configSchema>;
