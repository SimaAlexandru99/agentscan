import { MCP_PROFILES } from "../../src/facts/mcp-profiles";
import { skillSchemaFor } from "../../src/facts/providers";
import type { AgentFact, HookFact, McpFact, SkillFact } from "../../src/facts/types";

/**
 * Hand-built facts for check tests. Defaults are a Claude project file; a
 * caller that names another provider names its schema profile too.
 */
export function mcpFact(
  partial: Omit<McpFact, "schemaProfile" | "sourceProvider"> & Partial<Pick<McpFact, "schemaProfile" | "sourceProvider">>,
): McpFact {
  const schemaProfile = partial.schemaProfile ?? "claude-json";
  return { sourceProvider: MCP_PROFILES[schemaProfile].sourceProvider, ...partial, schemaProfile };
}

export function hookFact(
  partial: Omit<HookFact, "schemaProfile" | "sourceProvider"> &
    ({ sourceProvider?: undefined; schemaProfile?: undefined } | Pick<HookFact, "schemaProfile" | "sourceProvider">),
): HookFact {
  return { ...partial, sourceProvider: partial.sourceProvider ?? "claude", schemaProfile: partial.schemaProfile ?? "claude" };
}

export function agentFact(partial: Omit<AgentFact, "sourceProvider"> & Partial<Pick<AgentFact, "sourceProvider">>): AgentFact {
  return { ...partial, sourceProvider: partial.sourceProvider ?? "claude" };
}

export function skillFact(
  partial: Omit<SkillFact, "schemaProfile" | "sourceProvider"> & Partial<Pick<SkillFact, "schemaProfile" | "sourceProvider">>,
): SkillFact {
  const sourceProvider = partial.sourceProvider ?? "claude";
  return { ...partial, sourceProvider, schemaProfile: partial.schemaProfile ?? skillSchemaFor(sourceProvider) };
}
