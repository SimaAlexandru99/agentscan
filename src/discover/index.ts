import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { SkillscanConfig } from "../config/schema";
import type {
  AgentFact,
  HookFact,
  McpFact,
  SkillFact,
} from "../facts/types";

const POLICY_CAP = 100_000;
const SKILL_MD_CAP = 4_096;

export type AgentSurface = {
  skills: SkillFact[];
  agents: AgentFact[];
  hooks: HookFact[];
  mcp: McpFact[];
  policyFiles: { path: string; text: string }[];
};

/** Walk up from startDir for nearest package.json; throw if none. */
export function resolveRoot(startDir: string): string {
  let dir = resolve(startDir);
  for (;;) {
    if (existsSync(join(dir, "package.json"))) {
      return dir;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) {
      throw new Error(
        `No package.json found walking up from ${resolve(startDir)}`,
      );
    }
    dir = parent;
  }
}

function readFrontmatterDescription(skillMdPath: string): string | undefined {
  if (!existsSync(skillMdPath)) {
    return undefined;
  }
  let text: string;
  try {
    const buf = readFileSync(skillMdPath);
    text = buf.subarray(0, SKILL_MD_CAP).toString("utf8");
  } catch {
    return undefined;
  }
  // Optional YAML frontmatter between --- fences
  if (!text.startsWith("---")) {
    return undefined;
  }
  const end = text.indexOf("\n---", 3);
  if (end === -1) {
    return undefined;
  }
  const block = text.slice(3, end);
  const descMatch = block.match(/^description:\s*(.+)$/m);
  if (!descMatch?.[1]) {
    return undefined;
  }
  let value = descMatch[1].trim();
  // strip surrounding quotes
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return value || undefined;
}

function discoverSkillsInDir(
  dir: string,
  source: "project" | "global",
): SkillFact[] {
  if (!existsSync(dir)) {
    return [];
  }
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const skills: SkillFact[] = [];
  for (const name of entries) {
    const skillDir = join(dir, name);
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(skillDir);
    } catch {
      continue;
    }
    if (!st.isDirectory()) {
      continue;
    }
    const skillMd = join(skillDir, "SKILL.md");
    const description = readFrontmatterDescription(skillMd);
    const fact: SkillFact = {
      id: name,
      path: skillDir,
      source,
    };
    if (description !== undefined) {
      fact.description = description;
    }
    try {
      fact.mtimeMs = st.mtimeMs;
    } catch {
      // ignore
    }
    skills.push(fact);
  }
  return skills;
}

function parseMcpServers(
  raw: unknown,
  filePath: string,
): McpFact[] {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return [];
  }
  const obj = raw as Record<string, unknown>;
  // Prefer mcpServers wrapper; else treat top-level object map as servers
  let servers: Record<string, unknown>;
  if (
    "mcpServers" in obj &&
    obj.mcpServers !== null &&
    typeof obj.mcpServers === "object" &&
    !Array.isArray(obj.mcpServers)
  ) {
    servers = obj.mcpServers as Record<string, unknown>;
  } else if (
    !("mcpServers" in obj) &&
    Object.keys(obj).every((k) => {
      const v = obj[k];
      return v !== null && typeof v === "object" && !Array.isArray(v);
    })
  ) {
    servers = obj;
  } else {
    return [];
  }

  const facts: McpFact[] = [];
  for (const [name, value] of Object.entries(servers)) {
    let hasCommand = false;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const entry = value as Record<string, unknown>;
      hasCommand =
        typeof entry.command === "string" && entry.command.length > 0;
    }
    facts.push({ name, path: filePath, hasCommand });
  }
  return facts;
}

function discoverMcp(root: string, mcpPaths: string[]): McpFact[] {
  const facts: McpFact[] = [];
  const seen = new Set<string>();
  for (const rel of mcpPaths) {
    const filePath = join(root, rel);
    if (!existsSync(filePath)) {
      continue;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
    } catch {
      continue;
    }
    for (const fact of parseMcpServers(raw, filePath)) {
      const key = `${fact.name}@${fact.path}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      facts.push(fact);
    }
  }
  return facts;
}

function discoverHooks(root: string): HookFact[] {
  const files = [
    join(root, ".claude", "settings.json"),
    join(root, ".claude", "settings.local.json"),
  ];
  const facts: HookFact[] = [];
  for (const filePath of files) {
    if (!existsSync(filePath)) {
      continue;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
    } catch {
      continue;
    }
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      continue;
    }
    const hooks = (raw as Record<string, unknown>).hooks;
    if (hooks === null || typeof hooks !== "object" || Array.isArray(hooks)) {
      continue;
    }
    for (const event of Object.keys(hooks as Record<string, unknown>)) {
      facts.push({
        name: event,
        path: filePath,
        event,
      });
    }
  }
  return facts;
}

function discoverAgents(root: string): AgentFact[] {
  const dir = join(root, ".claude", "agents");
  if (!existsSync(dir)) {
    return [];
  }
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const facts: AgentFact[] = [];
  for (const name of entries) {
    const filePath = join(dir, name);
    try {
      const st = statSync(filePath);
      if (!st.isFile()) {
        continue;
      }
    } catch {
      continue;
    }
    // strip extension for display name when present
    const base = name.replace(/\.[^.]+$/, "");
    facts.push({ name: base || name, path: filePath });
  }
  return facts;
}

function discoverPolicyFiles(
  root: string,
  policyFiles: string[],
): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  for (const rel of policyFiles) {
    const filePath = join(root, rel);
    if (!existsSync(filePath)) {
      continue;
    }
    try {
      const buf = readFileSync(filePath);
      const text = buf.subarray(0, POLICY_CAP).toString("utf8");
      out.push({ path: filePath, text });
    } catch {
      // skip unreadable
    }
  }
  return out;
}

/**
 * Enumerate project (and optionally global) agent surface: skills, agents, hooks, MCP, policy.
 * Never throws on unknown shapes for hooks/MCP — empty lists instead.
 */
export function discoverAgentSurface(
  root: string,
  config: SkillscanConfig,
  opts: { includeGlobal: boolean },
): AgentSurface {
  const skills: SkillFact[] = [];
  for (const rel of config.skillPaths) {
    skills.push(...discoverSkillsInDir(join(root, rel), "project"));
  }

  if (opts.includeGlobal) {
    const home = homedir();
    skills.push(
      ...discoverSkillsInDir(join(home, ".claude", "skills"), "global"),
    );
    skills.push(
      ...discoverSkillsInDir(join(home, ".codex", "skills"), "global"),
    );
  }

  return {
    skills: dedupeSkillsById(skills),
    agents: discoverAgents(root),
    hooks: discoverHooks(root),
    mcp: discoverMcp(root, config.mcpPaths),
    policyFiles: discoverPolicyFiles(root, config.policyFiles),
  };
}

/**
 * One SkillFact per id. First path wins (skillPaths order, then global).
 * Prefer project over global when the same id appears later as project (re-scan).
 */
function dedupeSkillsById(skills: SkillFact[]): SkillFact[] {
  const byId = new Map<string, SkillFact>();
  for (const skill of skills) {
    const existing = byId.get(skill.id);
    if (!existing) {
      byId.set(skill.id, skill);
      continue;
    }
    // Prefer project source over global if we see project later
    if (existing.source === "global" && skill.source === "project") {
      byId.set(skill.id, skill);
    }
  }
  return [...byId.values()];
}
