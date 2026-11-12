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
   * `~/.claude`. `~/.claude.json` stays in the home directory.
   * See docs/spec/hook-sources.md and docs/spec/claude-memory.md.
   */
  claude: { dotDir: ".claude", homeEnv: "CLAUDE_CONFIG_DIR", skills: "claude", userSkills: true },
  cursor: { dotDir: ".cursor", skills: "agent-skills", portableSkills: true },
  /** Config-advanced: `CODEX_HOME` defaults to `~/.codex`. Never used to open `auth.json`. */
  codex: { dotDir: ".codex", homeEnv: "CODEX_HOME", skills: "agent-skills", userSkills: true, portableSkills: true },
  commandcode: { dotDir: ".commandcode", skills: "agent-skills", userSkills: true },
  /** Settings page: `$GROK_HOME`, or `~/.grok` when unset. Never used to open credential files. */
  grok: { dotDir: ".grok", homeEnv: "GROK_HOME", skills: "grok", userSkills: true },
  windsurf: { dotDir: ".windsurf", home: ".codeium/windsurf", skills: "agent-skills", userSkills: true },
  kiro: { dotDir: ".kiro", skills: "agent-skills", userSkills: true },
  cline: { dotDir: ".cline", skills: "agent-skills", userSkills: true },
  roo: { dotDir: ".roo", skills: "agent-skills", userSkills: true },
  kilo: { dotDir: ".kilo", skills: "agent-skills", userSkills: true },
  junie: { dotDir: ".junie", skills: "agent-skills", userSkills: true },
  vscode: { dotDir: ".vscode" },
  gemini: { dotDir: ".gemini" },
  opencode: { dotDir: ".opencode" },
  continue: { dotDir: ".continue" },
  antigravity: {},
  /** `$COPILOT_HOME`, otherwise `~/.copilot`. See docs/spec/copilot-hooks.md. */
  copilot: { dotDir: ".github", home: ".copilot", homeEnv: "COPILOT_HOME" },
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

export const PROJECT_SKILL_DIRS = WITH_SKILLS.map(([, spec]) => `${spec.dotDir}/skills`);

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
  WITH_SKILLS.filter(([id]) => id !== "commandcode").map(([, spec]) => spec.dotDir!),
);

export const USER_SKILL_PROVIDERS = WITH_SKILLS.filter(([, spec]) => spec.userSkills).map(([id]) => id);

export const AGENT_CONFIG_DOT_DIRS = SPECS.flatMap(([, spec]) => spec.dotDir ?? []);

const SKILL_MARKERS = WITH_SKILLS.flatMap(([id, spec]) => {
  const markers = [`/${spec.dotDir}/skills`];
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
