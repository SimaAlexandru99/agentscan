export type Provider =
  | "agent-skills"
  | "claude"
  | "codex"
  | "vscode"
  | "cursor"
  | "grok"
  | "antigravity"
  | "gemini"
  | "windsurf"
  | "kiro"
  | "cline"
  | "roo"
  | "kilo"
  | "opencode"
  | "junie"
  | "continue"
  | "commandcode"
  | "unknown";

export type Compatibility = {
  sourceProvider: Provider;
  consumedBy?: Provider[];
  schemaProfile?: string;
};

export type SkillSchemaProfile = "claude" | "agent-skills";

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
  | "continue-yaml";

export function schemaProfileFromSkillsDir(dir: string): SkillSchemaProfile {
  const normalized = dir.replaceAll("\\", "/");
  if (
    normalized.includes("/.agents/skills") ||
    normalized.endsWith("/.agents/skills") ||
    normalized.includes("/.cursor/skills") ||
    normalized.endsWith("/.cursor/skills") ||
    normalized.includes("/.codex/skills") ||
    normalized.endsWith("/.codex/skills") ||
    normalized.includes("/.commandcode/skills") ||
    normalized.endsWith("/.commandcode/skills")
  ) {
    return "agent-skills";
  }
  return "claude";
}

export function assertNever(value: never, message: string): never {
  throw new Error(message);
}

export function providerFromSkillsDir(dir: string): Provider {
  const normalized = dir.replaceAll("\\", "/");
  if (
    normalized.includes("/.claude/skills") ||
    normalized.endsWith("/.claude/skills")
  ) {
    return "claude";
  }
  if (
    normalized.includes("/.agents/skills") ||
    normalized.endsWith("/.agents/skills")
  ) {
    return "agent-skills";
  }
  if (
    normalized.includes("/.cursor/skills") ||
    normalized.endsWith("/.cursor/skills")
  ) {
    return "cursor";
  }
  if (
    normalized.includes("/.codex/skills") ||
    normalized.endsWith("/.codex/skills")
  ) {
    return "codex";
  }
  if (
    normalized.includes("/.commandcode/skills") ||
    normalized.endsWith("/.commandcode/skills")
  ) {
    return "commandcode";
  }
  return "unknown";
}

export function mcpProfileFromPath(filePath: string): McpSchemaProfile {
  const normalized = filePath.replaceAll("\\", "/");
  if (
    normalized.endsWith("/.commandcode/mcp.json") ||
    normalized.endsWith(".commandcode/mcp.json") ||
    /(?:^|\/)\.commandcode\/settings(?:\.local)?\.json$/.test(normalized)
  ) {
    return "commandcode-json";
  }
  if (
    /(?:^|\/)\.mcp\.json$/.test(normalized)
  ) {
    return "mcp-json";
  }
  if (
    normalized.endsWith("/.vscode/mcp.json") ||
    normalized.endsWith(".vscode/mcp.json")
  ) {
    return "vscode-json";
  }
  if (
    normalized.endsWith("/.cursor/mcp.json") ||
    normalized.endsWith(".cursor/mcp.json")
  ) {
    return "cursor-json";
  }
  if (
    normalized.endsWith("/.agents/mcp_config.json") ||
    normalized.endsWith(".agents/mcp_config.json")
  ) {
    return "antigravity-json";
  }
  if (
    normalized.endsWith("/.codex/config.toml") ||
    normalized.endsWith(".codex/config.toml")
  ) {
    return "codex-toml";
  }
  if (
    normalized.endsWith("/.gemini/settings.json") ||
    normalized.endsWith(".gemini/settings.json")
  ) {
    return "gemini-json";
  }
  if (
    normalized.includes("/.continue/mcpServers/") ||
    normalized.endsWith("/.continue/config.yaml") ||
    normalized.endsWith(".continue/config.yaml") ||
    normalized.endsWith("/.continue/config.yml") ||
    normalized.endsWith(".continue/config.yml")
  ) {
    return "continue-yaml";
  }
  if (
    /(?:^|\/)(?:\.opencode\/)?opencode\.jsonc?$/.test(normalized)
  ) {
    return "opencode-json";
  }
  return "claude-json";
}

export function sourceProviderForMcpProfile(
  profile: McpSchemaProfile,
): Provider {
  switch (profile) {
    case "claude-json":
      return "claude";
    case "mcp-json":
      return "unknown";
    case "commandcode-json":
      return "commandcode";
    case "vscode-json":
      return "vscode";
    case "cursor-json":
      return "cursor";
    case "antigravity-json":
      return "antigravity";
    case "codex-toml":
      return "codex";
    case "gemini-json":
      return "gemini";
    case "opencode-json":
      return "opencode";
    case "continue-yaml":
      return "continue";
    default: {
      return assertNever(profile, `unhandled MCP schema profile: ${profile}`);
    }
  }
}

export function consumedByForMcpProfile(profile: McpSchemaProfile): Provider[] {
  switch (profile) {
    case "mcp-json":
      return ["claude", "commandcode"];
    case "commandcode-json":
      return ["commandcode"];
    case "claude-json":
      return ["claude"];
    case "vscode-json":
      return ["vscode"];
    case "cursor-json":
      return ["cursor"];
    case "antigravity-json":
      return ["antigravity"];
    case "codex-toml":
      return ["codex"];
    case "gemini-json":
      return ["gemini"];
    case "opencode-json":
      return ["opencode"];
    case "continue-yaml":
      return ["continue"];
    default: {
      return assertNever(profile, `unhandled MCP schema profile: ${profile}`);
    }
  }
}
