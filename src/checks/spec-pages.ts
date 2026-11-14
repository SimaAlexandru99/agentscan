/**
 * Every vendor page a rule cites, with the date its capture was last read.
 *
 * The one place a cited URL is written: `STRUCTURAL_CHECKS` sources,
 * `scripts/spec-surfaces.ts` and `scripts/spec-drift.ts` all read it from here.
 * `scripts/spec-hashes.json` is keyed by these URLs, so changing one is a
 * baseline change, not a rename.
 */
export type SpecPage = { url: string; lastVerified: string };

export const SPEC_PAGES = {
  agentSkills: { url: "https://agentskills.io/specification", lastVerified: "2026-11-14" },
  claudeHooks: { url: "https://code.claude.com/docs/en/hooks", lastVerified: "2026-11-14" },
  claudeSubagents: { url: "https://code.claude.com/docs/en/sub-agents", lastVerified: "2026-11-13" },
  claudeSkills: { url: "https://code.claude.com/docs/en/skills", lastVerified: "2026-11-14" },
  claudeMcp: { url: "https://code.claude.com/docs/en/mcp", lastVerified: "2026-11-14" },
  claudeMemory: { url: "https://code.claude.com/docs/en/memory", lastVerified: "2026-11-14" },
  opencodeMcp: { url: "https://opencode.ai/v2/docs/mcp-servers", lastVerified: "2026-11-14" },
  copilotHooks: { url: "https://docs.github.com/en/copilot/reference/hooks-reference", lastVerified: "2026-11-14" },
  grokHooks: { url: "https://docs.x.ai/build/features/hooks", lastVerified: "2026-11-14" },
  grokMcp: { url: "https://docs.x.ai/build/features/mcp-servers", lastVerified: "2026-11-14" },
  grokSkills: { url: "https://docs.x.ai/build/features/skills-plugins-marketplaces", lastVerified: "2026-11-14" },
  commandcodeHooks: { url: "https://commandcode.ai/docs/hooks", lastVerified: "2026-09-02" },
  commandcodeMcp: { url: "https://commandcode.ai/docs/mcp", lastVerified: "2026-11-14" },
  commandcodeAgents: { url: "https://commandcode.ai/docs/agents", lastVerified: "2026-11-14" },
  kiroHooks: { url: "https://kiro.dev/docs/hooks/", lastVerified: "2026-11-14" },
  kiroHooksV1: { url: "https://kiro.dev/docs/ide/whats-new-v1/hooks/", lastVerified: "2026-11-14" },
  geminiHooks: { url: "https://geminicli.com/docs/hooks/", lastVerified: "2026-09-03" },
  geminiMcp: { url: "https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md", lastVerified: "2026-11-14" },
  vscodeHooks: { url: "https://code.visualstudio.com/docs/agents/reference/hooks-reference", lastVerified: "2026-11-14" },
  vscodeMcp: { url: "https://code.visualstudio.com/docs/agents/reference/mcp-configuration", lastVerified: "2026-11-12" },
  windsurfRules: { url: "https://docs.windsurf.com/windsurf/cascade/memories", lastVerified: "2026-11-14" },
  windsurfMcp: { url: "https://docs.windsurf.com/windsurf/cascade/mcp", lastVerified: "2026-11-14" },
  windsurfHooks: { url: "https://docs.devin.ai/desktop/cascade/hooks", lastVerified: "2026-11-14" },
  cursorHooks: { url: "https://cursor.com/docs/hooks", lastVerified: "2026-11-14" },
  cursorRules: { url: "https://cursor.com/docs/rules", lastVerified: "2026-11-14" },
  cursorMcp: { url: "https://cursor.com/docs/context/mcp", lastVerified: "2026-11-14" },
  continueMcp: { url: "https://docs.continue.dev/customize/deep-dives/mcp", lastVerified: "2026-09-02" },
  codexMcp: { url: "https://learn.chatgpt.com/docs/extend/mcp", lastVerified: "2026-11-14" },
  codexAgentsMd: { url: "https://learn.chatgpt.com/docs/agent-configuration/agents-md", lastVerified: "2026-11-14" },
  codexHooks: { url: "https://learn.chatgpt.com/docs/hooks", lastVerified: "2026-11-12" },
  codexAgents: { url: "https://learn.chatgpt.com/docs/agent-configuration/subagents", lastVerified: "2026-11-14" },
  antigravityMcp: { url: "https://antigravity.google/docs/mcp", lastVerified: "2026-11-14" },
  antigravityHooks: { url: "https://antigravity.google/docs/hooks", lastVerified: "2026-11-12" },
  antigravityRules: { url: "https://antigravity.google/docs/rules", lastVerified: "2026-11-12" },
  devinHooks: { url: "https://docs.devin.ai/cli/extensibility/hooks/overview", lastVerified: "2026-11-14" },
  devinMcp: { url: "https://docs.devin.ai/cli/extensibility/mcp/configuration", lastVerified: "2026-11-14" },
  // No rule cites this page; `spec:check` reads VS Code hook event names from it.
  vscodeHooksGuide: { url: "https://code.visualstudio.com/docs/agent-customization/hooks", lastVerified: "2026-09-02" },
} as const satisfies Record<string, SpecPage>;
