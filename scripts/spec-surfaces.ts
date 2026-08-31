export type SpecSurface = {
  provider: string;
  surface: "instructions" | "skills" | "agents" | "hooks" | "mcp" | "rules";
  lastVerified: string;
  sourceType: "official" | "vendor-recommendation";
  stalenessRisk: "low" | "medium" | "high";
  url: string;
};

/**
 * Machine list of captured surfaces. `spec:check` warns when lastVerified is
 * older than 90 days. Network fetches stay in this script, never on `check`.
 */
export const SPEC_SURFACES: SpecSurface[] = [
  {
    provider: "agent-skills",
    surface: "skills",
    lastVerified: "2026-08-30",
    sourceType: "official",
    stalenessRisk: "medium",
    url: "https://agentskills.io/specification",
  },
  {
    provider: "AGENTS.md",
    surface: "instructions",
    lastVerified: "2026-08-30",
    sourceType: "official",
    stalenessRisk: "medium",
    url: "https://agents.md/",
  },
  {
    provider: "claude",
    surface: "instructions",
    lastVerified: "2026-08-30",
    sourceType: "official",
    stalenessRisk: "medium",
    url: "https://code.claude.com/docs/en/memory",
  },
  {
    provider: "claude",
    surface: "skills",
    lastVerified: "2026-08-30",
    sourceType: "official",
    stalenessRisk: "medium",
    url: "https://code.claude.com/docs/en/skills",
  },
  {
    provider: "claude",
    surface: "agents",
    lastVerified: "2026-08-30",
    sourceType: "official",
    stalenessRisk: "medium",
    url: "https://code.claude.com/docs/en/sub-agents",
  },
  {
    provider: "claude",
    surface: "hooks",
    lastVerified: "2026-08-30",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://code.claude.com/docs/en/hooks",
  },
  {
    provider: "claude",
    surface: "mcp",
    lastVerified: "2026-08-30",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://code.claude.com/docs/en/mcp",
  },
  {
    provider: "codex",
    surface: "instructions",
    lastVerified: "2026-08-30",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://learn.chatgpt.com/docs/agent-configuration/agents-md",
  },
  {
    provider: "codex",
    surface: "mcp",
    lastVerified: "2026-08-30",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://learn.chatgpt.com/docs/extend/mcp",
  },
  {
    provider: "codex",
    surface: "skills",
    lastVerified: "2026-08-30",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://agentskills.io/specification",
  },
  {
    provider: "vscode",
    surface: "instructions",
    lastVerified: "2026-08-30",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://code.visualstudio.com/docs/agent-customization/custom-instructions",
  },
  {
    provider: "vscode",
    surface: "agents",
    lastVerified: "2026-08-30",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://code.visualstudio.com/docs/agent-customization/custom-agents",
  },
  {
    provider: "vscode",
    surface: "hooks",
    lastVerified: "2026-08-30",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://code.visualstudio.com/docs/agent-customization/hooks",
  },
  {
    provider: "vscode",
    surface: "mcp",
    lastVerified: "2026-08-30",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://code.visualstudio.com/docs/copilot/customization/mcp-servers",
  },
  {
    provider: "cursor",
    surface: "skills",
    lastVerified: "2026-08-30",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://cursor.com/docs/skills",
  },
  {
    provider: "cursor",
    surface: "rules",
    lastVerified: "2026-08-30",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://cursor.com/docs/rules",
  },
  {
    provider: "cursor",
    surface: "mcp",
    lastVerified: "2026-08-30",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://cursor.com/docs/context/mcp",
  },
  {
    provider: "antigravity",
    surface: "mcp",
    lastVerified: "2026-08-30",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://antigravity.google/docs/mcp",
  },
  {
    provider: "gemini",
    surface: "mcp",
    lastVerified: "2026-08-30",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md",
  },
  {
    provider: "opencode",
    surface: "mcp",
    lastVerified: "2026-08-30",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://opencode.ai/v2/docs/mcp-servers",
  },
  {
    provider: "continue",
    surface: "mcp",
    lastVerified: "2026-08-30",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://docs.continue.dev/customize/deep-dives/mcp",
  },
  {
    provider: "commandcode",
    surface: "mcp",
    lastVerified: "2026-08-31",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://commandcode.ai/docs/mcp",
  },
  {
    provider: "commandcode",
    surface: "hooks",
    lastVerified: "2026-08-31",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://commandcode.ai/docs/hooks",
  },
  {
    provider: "commandcode",
    surface: "skills",
    lastVerified: "2026-08-31",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://commandcode.ai/docs/skills",
  },
  {
    provider: "commandcode",
    surface: "agents",
    lastVerified: "2026-08-31",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://commandcode.ai/docs/agents",
  },
  {
    provider: "commandcode",
    surface: "instructions",
    lastVerified: "2026-08-31",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://commandcode.ai/docs/memory",
  },
];

const STALE_AFTER_DAYS = 90;

export function surfaceStalenessNotes(today = Date.now()): string[] {
  const notes: string[] = [];
  for (const surface of SPEC_SURFACES) {
    const days = Math.floor((today - Date.parse(surface.lastVerified)) / 86_400_000);
    if (days > STALE_AFTER_DAYS) {
      notes.push(
        `${surface.provider} ${surface.surface} lastVerified ${surface.lastVerified} is ${days} days old (over ${STALE_AFTER_DAYS}) — ${surface.url}`,
      );
    }
  }
  return notes;
}
