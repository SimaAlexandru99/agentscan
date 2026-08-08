import { z } from "zod";

export const defaultConfig = {
  skillPaths: [".agents/skills", ".claude/skills", "skills", ".cursor/skills"],
  mcpPaths: [".mcp.json", ".claude/mcp.json", "mcp.json"],
  policyFiles: ["AGENTS.md", "CLAUDE.md"],
  ignoreSkills: [] as string[],
  ignoreRules: [] as string[],
  failOn: "never" as const,
  includeGlobal: false,
};

export const configSchema = z.object({
  skillPaths: z.array(z.string()).default(defaultConfig.skillPaths),
  mcpPaths: z.array(z.string()).default(defaultConfig.mcpPaths),
  policyFiles: z.array(z.string()).default(defaultConfig.policyFiles),
  ignoreSkills: z.array(z.string()).default([]),
  ignoreRules: z.array(z.string()).default([]),
  failOn: z.enum(["never", "warning", "error"]).default("never"),
  includeGlobal: z.boolean().default(false),
});

export type SkillscanConfig = z.infer<typeof configSchema>;
