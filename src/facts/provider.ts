import { toPosix } from "./paths";
export type { Provider, SkillSchemaProfile } from "./providers";

export type McpLaunchKind = "command" | "url" | "registry-reference" | "no-launch";

export type McpSchemaProfile =
  | "claude-json"
  | "mcp-json"
  | "commandcode-json"
  | "vscode-json"
  | "cursor-json"
  | "antigravity-json"
  | "codex-toml"
  | "gemini-json"
  | "opencode-json"
  | "continue-yaml"
  | "grok-toml"
  | "windsurf-json"
  | "devin-json"
  | "copilot-json"
  | "qwen-json"
  | "factory-json"
  | "goose-yaml";

export function assertNever(value: never, message: string): never {
  throw new Error(message);
}

/**
 * One row per MCP path shape: which profile owns it, and whether `.json` is
 * parsed as JSONC. First match wins. Anything else is Claude's `mcp.json`.
 * `jsonc` is the path, not the profile: Continue YAML and its server JSON
 * files share `continue-yaml`.
 */
const MCP_FILE_RULES: readonly {
  profile: McpSchemaProfile;
  test: (normalized: string) => boolean;
  jsonc?: true;
}[] = [
  {
    profile: "commandcode-json",
    test: (p) =>
      p.endsWith(".commandcode/mcp.json") ||
      /(?:^|\/)\.commandcode\/settings(?:\.local)?\.json$/.test(p),
  },
  { profile: "mcp-json", test: (p) => /(?:^|\/)\.mcp\.json$/.test(p) },
  { profile: "vscode-json", test: (p) => /(?:^|\/)\.vscode\/mcp\.json$/.test(p), jsonc: true },
  { profile: "cursor-json", test: (p) => /(?:^|\/)\.cursor\/mcp\.json$/.test(p), jsonc: true },
  {
    profile: "antigravity-json",
    test: (p) =>
      p.endsWith(".agents/mcp_config.json") || p.endsWith(".gemini/config/mcp_config.json"),
  },
  { profile: "codex-toml", test: (p) => p.endsWith(".codex/config.toml") },
  { profile: "gemini-json", test: (p) => /(?:^|\/)\.gemini\/settings\.json$/.test(p), jsonc: true },
  { profile: "continue-yaml", test: (p) => /\/\.continue\/mcpServers\/.*\.json$/.test(p), jsonc: true },
  {
    profile: "continue-yaml",
    test: (p) =>
      p.includes("/.continue/mcpServers/") ||
      p.endsWith(".continue/config.yaml") ||
      p.endsWith(".continue/config.yml"),
  },
  {
    profile: "opencode-json",
    test: (p) => /(?:^|\/)(?:\.opencode\/)?opencode\.jsonc?$/.test(p),
    jsonc: true,
  },
  { profile: "grok-toml", test: (p) => p.endsWith(".grok/config.toml") },
  {
    profile: "windsurf-json",
    test: (p) => /(?:^|\/)\.codeium\/windsurf\/mcp_config\.json$/.test(p),
  },
  {
    profile: "devin-json",
    test: (p) => /(?:^|\/)\.devin\/mcp_config(?:\.local)?\.json$/.test(p),
  },
  {
    profile: "copilot-json",
    test: (p) => /(?:^|\/)\.copilot\/mcp-config\.json$/.test(p),
  },
  { profile: "qwen-json", test: (p) => /(?:^|\/)\.qwen\/settings\.json$/.test(p), jsonc: true },
  { profile: "factory-json", test: (p) => /(?:^|\/)\.factory\/mcp\.json$/.test(p) },
];

/** Default `mcpPaths`. Order is the order project files are read. */
export const DEFAULT_MCP_PATHS = [
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
  ".devin/mcp_config.json",
  ".devin/mcp_config.local.json",
] as const;

export function mcpProfileFromPath(filePath: string): McpSchemaProfile {
  const normalized = toPosix(filePath);
  return MCP_FILE_RULES.find((rule) => rule.test(normalized))?.profile ?? "claude-json";
}

/** `.json` files whose tool accepts comments. Extension `.jsonc` is decided by the reader. */
export function mcpFileIsJsonc(normalizedPath: string): boolean {
  return MCP_FILE_RULES.some((rule) => rule.jsonc === true && rule.test(normalizedPath));
}
