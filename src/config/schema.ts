import { z } from "zod";
import { DEFAULT_MCP_PATHS } from "../facts/provider";
import { DEFAULT_SKILL_PATHS } from "../facts/providers";

export const failOnSchema = z.enum(["never", "warning", "error"]);
export type FailOn = z.infer<typeof failOnSchema>;

/** `check --output`. Not a config key; declared here next to the other enum. */
export const outputFormatSchema = z.enum(["human", "json", "prompt"]);
export type OutputFormat = z.infer<typeof outputFormatSchema>;

const limit = z.number().int().positive();

const thresholdsSchema = z.object({
  /**
   * Characters of Claude skill listing text (description or first markdown
   * paragraph, plus when_to_use) loaded at startup. Official runtime is 1% of
   * the model context window; this fallback is 8000 characters when the window
   * is unknown. Each entry is truncated at skillListingMaxDescChars.
   */
  skillListingChars: limit.default(8_000),
  skillListingMaxDescChars: limit.default(1_536),
  mcp: limit.default(5),
  agentsMdLines: limit.default(150),
  claudeMdLines: limit.default(200),
  agents: limit.default(8),
}).strict();

export const configSchema = z.object({
  skillPaths: z.array(z.string()).default([...DEFAULT_SKILL_PATHS]),
  mcpPaths: z.array(z.string()).default([...DEFAULT_MCP_PATHS]),
  policyFiles: z.array(z.string()).default(["AGENTS.md", "CLAUDE.md"]),
  ignoreSkills: z.array(z.string()).default([]),
  ignoreRules: z.array(z.string()).default([]),
  /** Exact finding ids, the same strings `agentscan explain` takes. */
  ignoreFindings: z.array(z.string()).default([]),
  failOn: failOnSchema.default("never"),
  includeGlobal: z.boolean().default(false),
  requireLock: z.boolean().default(false),
  thresholds: thresholdsSchema.default({}),
}).strict();

export type AgentscanConfig = z.infer<typeof configSchema>;
export type Thresholds = AgentscanConfig["thresholds"];

export const defaultConfig: AgentscanConfig = configSchema.parse({});
