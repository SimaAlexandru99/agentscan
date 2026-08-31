/**
 * Old rule ids accepted in ignoreRules / explain through 0.8.x.
 * Findings emit the canonical (right-hand) id.
 */
export const RULE_ALIASES: Record<string, string> = {
  "hook.unknown-event": "claude.hook.unknown-event",
  "hook.missing-script": "claude.hook.missing-script",
  "skill.missing-frontmatter": "claude.skill.missing-frontmatter",
  "skill.missing-description": "claude.skill.missing-description",
  "agent.missing-frontmatter": "claude.agent.missing-frontmatter",
  "agent.missing-description": "claude.agent.missing-description",
  "agent.missing-name": "claude.agent.missing-name",
  "agent.duplicate-name": "claude.agent.duplicate-name",
  "agent.invalid-name": "claude.agent.invalid-name",
  "mcp.no-launch": "claude.mcp.no-launch",
  "mcp.url-without-type": "claude.mcp.url-without-type",
  "mcp.hardcoded-secret": "security.hardcoded-secret",
  "claude.hook.mcp-tool-without-name": "claude.hook.mcp-tool-without-server-or-tool",
};

export function canonicalRuleId(id: string): string {
  return RULE_ALIASES[id] ?? id;
}

export function ruleIdsMatch(configured: string, emitted: string): boolean {
  return canonicalRuleId(configured) === emitted || configured === emitted;
}

/** Canonicalize the rule-id prefix of a finding id (`rule:subject`). */
export function canonicalizeFindingId(id: string): string {
  const colon = id.indexOf(":");
  if (colon === -1) {
    return canonicalRuleId(id);
  }
  return `${canonicalRuleId(id.slice(0, colon))}${id.slice(colon)}`;
}

export function ignoreRuleSet(ids: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const id of ids) {
    out.add(id);
    out.add(canonicalRuleId(id));
  }
  return out;
}
