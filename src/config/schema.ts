import { z } from "zod";

export const defaultThresholds = {
  /**
   * Characters of Claude skill listing text (description or first markdown
   * paragraph, plus when_to_use) loaded at startup. Official runtime is 1% of
   * the model context window; this fallback is 8000 characters when the window
   * is unknown. Each entry is truncated at skillListingMaxDescChars (1536).
   */
  skillListingChars: 8_000,
  skillListingMaxDescChars: 1_536,
  mcp: 5,
  agentsMdLines: 150,
  claudeMdLines: 200,
  agents: 8,
};

export const defaultConfig = {
  skillPaths: [".agents/skills", ".claude/skills", "skills", ".cursor/skills", ".codex/skills", ".commandcode/skills", ".grok/skills"],
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
    ".continue/mcpServers",
    ".grok/config.toml",
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
  skillListingChars: z
    .number()
    .int()
    .positive()
    .default(defaultThresholds.skillListingChars),
  skillListingMaxDescChars: z
    .number()
    .int()
    .positive()
    .default(defaultThresholds.skillListingMaxDescChars),
  /** @deprecated accepted for one release as an alias of skillListingChars. */
  skillDescriptionBytes: z.number().int().positive().optional(),
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
