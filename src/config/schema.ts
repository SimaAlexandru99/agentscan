import { z } from "zod";

export const defaultThresholds = {
  skills: 30,
  mcp: 5,
  agentsMdLines: 150,
  claudeMdLines: 200,
  agents: 8,
};

export const defaultConfig = {
  skillPaths: [".agents/skills", ".claude/skills", "skills", ".cursor/skills"],
  mcpPaths: [".mcp.json", ".claude/mcp.json", "mcp.json"],
  policyFiles: ["AGENTS.md", "CLAUDE.md"],
  ignoreSkills: [] as string[],
  ignoreRules: [] as string[],
  failOn: "never" as const,
  includeGlobal: false,
  thresholds: defaultThresholds,
};

const thresholdsSchema = z.object({
  skills: z.number().int().positive().default(defaultThresholds.skills),
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
});

export const configSchema = z.object({
  skillPaths: z.array(z.string()).default(defaultConfig.skillPaths),
  mcpPaths: z.array(z.string()).default(defaultConfig.mcpPaths),
  policyFiles: z.array(z.string()).default(defaultConfig.policyFiles),
  ignoreSkills: z.array(z.string()).default([]),
  ignoreRules: z.array(z.string()).default([]),
  failOn: z.enum(["never", "warning", "error"]).default("never"),
  includeGlobal: z.boolean().default(false),
  thresholds: thresholdsSchema.default(defaultThresholds),
});

export type SkillscanConfig = z.infer<typeof configSchema>;
