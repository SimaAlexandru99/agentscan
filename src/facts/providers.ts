import { homedir } from "node:os";
import { join } from "node:path";
import { toPosix } from "./paths";

export type SkillSchemaProfile = "claude" | "agent-skills" | "grok";

/**
 * Static per-provider knowledge. Adding a provider's dirs or home is one entry here;
 * skill paths, nested discovery, global dirs, config defaults and scan-root
 * signals are derived from it.
 */
type ProviderSpec = {
  /** Project directory; every one is an agent-config signal for scan-root detection. */
  dotDir?: string;
  home?: string;
  homeEnv?: string;
  skills?: SkillSchemaProfile;
  userSkills?: true;
  /** Other agents load these skills too, so they are checked even when Command Code shadows them. */
  portableSkills?: true;
  /** More project dirs whose `skills/` child this provider reads, besides `dotDir`. */
  skillDotDirs?: string[];
};

/**
 * Order is the default `skillPaths` order. Copilot CLI hooks report as `vscode`;
 * its entry only carries the home.
 */
export const PROVIDERS = {
  "agent-skills": { dotDir: ".agents", skills: "agent-skills", userSkills: true, portableSkills: true },
  /**
   * Quoted settings page: `CLAUDE_CONFIG_DIR` keeps home-directory files
   * (`settings`, skills, agents, `CLAUDE.md`, rules) somewhere other than
   * `~/.claude`. The SDK page (read 2026-11-12) also relocates
   * `~/.claude.json` to `$CLAUDE_CONFIG_DIR/.claude.json`. Unset, that file
   * stays `join(homedir(), ".claude.json")`.
   * See docs/spec/hook-sources.md, docs/spec/claude-memory.md, and docs/spec/mcp.md.
   */
  claude: { dotDir: ".claude", homeEnv: "CLAUDE_CONFIG_DIR", skills: "claude", userSkills: true },
  /** cursor.com/docs/skills: project `.cursor/skills`, user `~/.cursor/skills`. */
  cursor: { dotDir: ".cursor", skills: "agent-skills", userSkills: true, portableSkills: true },
  /**
   * Config-advanced: `CODEX_HOME` defaults to `~/.codex`. Never used to open `auth.json`.
   * developers.openai.com/codex/skills (2026-11-14): Codex reads `.agents/skills` and
   * `~/.agents/skills` (the agent-skills entry), not `.codex/skills`; only its bundled
   * `.system` set lives under `~/.codex/skills`, so no skills here.
   */
  codex: { dotDir: ".codex", homeEnv: "CODEX_HOME" },
  commandcode: { dotDir: ".commandcode", skills: "agent-skills", userSkills: true },
  /** Settings page: `$GROK_HOME`, or `~/.grok` when unset. Never used to open credential files. */
  grok: { dotDir: ".grok", homeEnv: "GROK_HOME", skills: "grok", userSkills: true },
  windsurf: { dotDir: ".windsurf", home: ".codeium/windsurf", skills: "agent-skills", userSkills: true },
  /**
   * Devin CLI. Linux/macOS user config is `~/.config/devin`. Windows
   * `%APPDATA%\devin` is unread. `.windsurf` and `.codeium/windsurf` stay on
   * `windsurf`. See docs/spec/devin-hooks.md and docs/spec/devin-mcp.md.
   */
  devin: { dotDir: ".devin", home: ".config/devin", skills: "agent-skills", userSkills: true },
  kiro: { dotDir: ".kiro", skills: "agent-skills", userSkills: true },
  /** docs.cline.bot/customization/skills: `.cline/skills` and `.clinerules/skills`. */
  cline: { dotDir: ".cline", skillDotDirs: [".clinerules"], skills: "agent-skills", userSkills: true },
  roo: { dotDir: ".roo", skills: "agent-skills", userSkills: true },
  kilo: { dotDir: ".kilo", skills: "agent-skills", userSkills: true },
  junie: { dotDir: ".junie", skills: "agent-skills", userSkills: true },
  vscode: { dotDir: ".vscode" },
  gemini: { dotDir: ".gemini" },
  opencode: { dotDir: ".opencode" },
  continue: { dotDir: ".continue" },
  /**
   * User config root for `hooks.json`, `mcp_config.json`, `rules/`, and
   * `skills/`. No `dotDir`: project `.agents` stays the `agent-skills`
   * provider, and project hooks are opened by the `.agents/hooks.json` path.
   * See docs/spec/antigravity-hooks.md and docs/spec/antigravity-skills.md.
   */
  antigravity: { home: ".gemini/config", userSkills: true, skills: "agent-skills" },
  /** `$COPILOT_HOME`, otherwise `~/.copilot`. See docs/spec/copilot-hooks.md. */
  copilot: { dotDir: ".github", home: ".copilot", homeEnv: "COPILOT_HOME" },
  /** Qwen Code: `.qwen/settings.json` (MCP, hooks) and `.qwen/skills`. See docs/spec/qwen-*.md. */
  qwen: { dotDir: ".qwen", skills: "agent-skills", userSkills: true },
  /** Factory Droid: `.factory/{mcp,hooks}.json`, `skills/`, `droids/`. See docs/spec/factory-*.md. */
  factory: { dotDir: ".factory", skills: "agent-skills", userSkills: true },
} satisfies Record<string, ProviderSpec>;

/** Every provider a fact can name. Copilot CLI reports as `vscode`; `unknown` has no entry. */
export type Provider = Exclude<keyof typeof PROVIDERS, "copilot"> | "unknown";

export type ProviderKey = keyof typeof PROVIDERS;

const SPECS = Object.entries(PROVIDERS) as [ProviderKey, ProviderSpec][];

export function providerHome(id: ProviderKey): string {
  const spec: ProviderSpec = PROVIDERS[id];
  const override = spec.homeEnv === undefined ? undefined : process.env[spec.homeEnv]?.trim();
  if (override !== undefined && override.length > 0) {
    return override;
  }
  return join(homedir(), spec.home ?? spec.dotDir ?? "");
}

const WITH_SKILLS = SPECS.filter(([, spec]) => spec.skills !== undefined) as [Exclude<Provider, "unknown">, ProviderSpec][];

/** Project `skills/` dirs. A provider with `skills` but no `dotDir` is user-only. */
export const PROJECT_SKILL_DIRS = WITH_SKILLS.flatMap(([, spec]) =>
  [...(spec.dotDir === undefined ? [] : [spec.dotDir]), ...(spec.skillDotDirs ?? [])].map((dir) => `${dir}/skills`),
);

/**
 * Default `skillPaths`. The bare `skills/` dir belongs to no provider and sits
 * after the two historic heads, named here so a new provider cannot shift it.
 */
const SKILL_PATHS_BEFORE_BARE = [".agents/skills", ".claude/skills"] as const;

export const DEFAULT_SKILL_PATHS = [
  ...SKILL_PATHS_BEFORE_BARE,
  "skills",
  ...PROJECT_SKILL_DIRS.filter(
    (dir) => !(SKILL_PATHS_BEFORE_BARE as readonly string[]).includes(dir),
  ),
];

/**
 * Dirs whose `skills/` child nested discovery inspects. Command Code reads
 * `.commandcode/skills` only at its project root, never in a nested package.
 */
export const SKILL_DOT_DIRS = new Set(
  WITH_SKILLS.flatMap(([id, spec]) =>
    id === "commandcode" || spec.dotDir === undefined ? [] : [spec.dotDir, ...(spec.skillDotDirs ?? [])],
  ),
);

export const USER_SKILL_PROVIDERS = WITH_SKILLS.filter(([, spec]) => spec.userSkills).map(([id]) => id);

export const AGENT_CONFIG_DOT_DIRS = SPECS.flatMap(([, spec]) => spec.dotDir ?? []);

const SKILL_MARKERS = WITH_SKILLS.flatMap(([id, spec]) => {
  const markers: string[] = [];
  for (const dir of [spec.dotDir, ...(spec.skillDotDirs ?? [])]) {
    if (dir !== undefined) {
      markers.push(`/${dir}/skills`);
    }
  }
  if (spec.home !== undefined && spec.userSkills) {
    markers.push(`/${spec.home}/skills`);
  }
  return markers.map((marker) => ({ id, marker }));
});

/**
 * The provider skills dir a path sits in: the marker that occurs last, so a
 * repo checked out under another provider's skills dir keeps its own provider.
 */
export function skillsMarker(path: string): { id: Provider; root: string } | undefined {
  const normalized = toPosix(path);
  let best: { id: Provider; root: string; index: number } | undefined;
  for (const { id, marker } of SKILL_MARKERS) {
    const index = normalized.lastIndexOf(marker);
    if (index !== -1 && (best === undefined || index > best.index)) {
      best = { id, root: normalized.slice(0, index + marker.length), index };
    }
  }
  return best;
}

export function providerFromSkillsDir(dir: string): Provider {
  return skillsMarker(dir)?.id ?? "unknown";
}

export function skillSchemaFor(provider: Provider | undefined): SkillSchemaProfile {
  if (provider === undefined || provider === "unknown") {
    return "claude";
  }
  const spec: ProviderSpec = PROVIDERS[provider];
  return spec.skills ?? "claude";
}

export function isPortableSkillProvider(provider: Provider | undefined): boolean {
  if (provider === undefined || provider === "unknown") {
    return false;
  }
  const spec: ProviderSpec = PROVIDERS[provider];
  return spec.portableSkills === true;
}
