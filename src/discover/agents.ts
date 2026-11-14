import { isFile, isRecord, listDir, readConfigFile, reportRootShapeOnce, type ScanIO } from "./fs";
import { dirname, join } from "node:path";
import { toPosix } from "../facts/paths";
import { providerHome } from "../facts/providers";
import type { AgentFact } from "../facts/types";
import { discoverCommandcodeAgents } from "./commandcode";
import { ancestorDirsInclusive } from "./scan-context";
import { hooksFromObject } from "./hooks";
import { readFrontmatter } from "./frontmatter";

/** Agent definitions nest, so a one-level scan misses `agents/review/x.md`. */
function agentFiles(dir: string, io: ScanIO): string[] {
  const out: string[] = [];
  for (const entry of (listDir(dir, io, { optional: true }) ?? []).map((e) => (e.isDirectory() ? `${e.name}/` : e.name))) {
    if (entry.startsWith(".")) {
      continue;
    }
    if (entry.endsWith("/")) {
      out.push(
        ...agentFiles(join(dir, entry.slice(0, -1)), io).map((p) =>
          join(entry.slice(0, -1), p),
        ),
      );
      continue;
    }
    out.push(entry);
  }
  return out;
}

function readClaudeAgent(
  filePath: string,
  name: string,
  root: string,
  namespace: string,
  io: ScanIO,
  includeFrontmatterHooks = true,
): AgentFact {
  const fm = readFrontmatter(filePath, io);
  const fact: AgentFact = {
    name: name.slice(0, -".md".length),
    path: filePath,
    sourceProvider: "claude",
    schemaProfile: "claude-md",
    namespace,
    nameSource: fm.name !== undefined ? "frontmatter" : "filename",
    hasFrontmatter: fm.hasFrontmatter,
  };
  if (fm.unreadable === true) {
    fact.unreadable = true;
  }
  if (fm.unparseable === true) {
    fact.unparseableFrontmatter = true;
  }
  if (fm.name !== undefined) {
    fact.frontmatterName = fm.name;
  }
  if (fm.description !== undefined) {
    fact.description = fm.description;
  }
  if (includeFrontmatterHooks && fm.hooks !== undefined) {
    const hooks = hooksFromObject(fm.hooks, filePath, "agent", {
      project: root,
      own: dirname(filePath),
    }, io, { sourceProvider: "claude", schemaProfile: "claude" });
    if (hooks.length > 0) {
      fact.frontmatterHooks = hooks;
    }
  }
  return fact;
}

/**
 * Recursive `.md` under a Claude `agents/` directory.
 * Plugin agents omit frontmatter hooks — Claude ignores those fields.
 * See docs/spec/claude-subagents.md.
 */
export function discoverClaudeAgentsDir(
  dir: string,
  root: string,
  io: ScanIO,
  includeFrontmatterHooks = true,
): AgentFact[] {
  const entries = agentFiles(dir, io);
  const facts: AgentFact[] = [];
  for (const name of entries) {
    if (!name.endsWith(".md")) {
      continue;
    }
    const filePath = join(dir, name);
    if (!isFile(filePath)) {
      continue;
    }
    facts.push(readClaudeAgent(filePath, name, root, dir, io, includeFrontmatterHooks));
  }
  return facts;
}

function discoverVscodeAgents(root: string, io: ScanIO): AgentFact[] {
  const dir = join(root, ".github", "agents");
  const facts: AgentFact[] = [];
  for (const { name } of listDir(dir, io, { optional: true }) ?? []) {
    if (name.startsWith(".")) {
      continue;
    }
    if (!name.endsWith(".agent.md") && !name.endsWith(".md")) {
      continue;
    }
    const filePath = join(dir, name);
    if (!isFile(filePath)) {
      continue;
    }
    const fm = readFrontmatter(filePath, io);
    const stem = name.endsWith(".agent.md")
      ? name.slice(0, -".agent.md".length)
      : name.slice(0, -".md".length);
    const fact: AgentFact = {
      name: fm.name ?? stem,
      path: filePath,
      sourceProvider: "vscode",
      schemaProfile: "vscode-agent-md",
      namespace: dir,
      nameSource: fm.name !== undefined ? "frontmatter" : "filename",
      hasFrontmatter: fm.hasFrontmatter,
    };
    if (fm.unreadable === true) {
      fact.unreadable = true;
    }
    if (fm.unparseable === true) {
      fact.unparseableFrontmatter = true;
    }
    if (fm.name !== undefined) {
      fact.frontmatterName = fm.name;
    }
    if (fm.description !== undefined) {
      fact.description = fm.description;
    }
    if (fm.hooks !== undefined) {
      const hooks = hooksFromObject(
        fm.hooks,
        filePath,
        "agent",
        { project: root, own: dirname(filePath) },
        io,
        { sourceProvider: "vscode", schemaProfile: "vscode-native" },
      );
      if (hooks.length > 0) {
        fact.frontmatterHooks = hooks;
      }
    }
    facts.push(fact);
  }
  return facts;
}

/** Farther than any ancestor hop, so a workspace agent wins over a global one. */
const KIRO_GLOBAL_HOPS = Number.MAX_SAFE_INTEGER;

/**
 * The page names the agent from the path under `agents/`, without the
 * extension. `team/planner.md` is `team/planner`. See docs/spec/kiro-agents.md.
 */
function kiroAgentName(rel: string): string | undefined {
  const posix = toPosix(rel);
  if (posix.endsWith(".json")) {
    return posix.slice(0, -".json".length);
  }
  if (posix.endsWith(".md")) {
    return posix.slice(0, -".md".length);
  }
  return undefined;
}

function readKiroAgent(filePath: string, name: string, namespace: string, io: ScanIO): AgentFact {
  const fact: AgentFact = {
    name,
    path: filePath,
    sourceProvider: "kiro",
    namespace,
    nameSource: "filename",
    hasFrontmatter: false,
  };
  if (filePath.endsWith(".json")) {
    const value = readConfigFile(filePath, io);
    if (value !== undefined && !isRecord(value)) {
      reportRootShapeOnce(filePath, io, "Kiro agent root is not an object");
    }
    return fact;
  }
  const fm = readFrontmatter(filePath, io);
  fact.hasFrontmatter = fm.hasFrontmatter;
  if (fm.unreadable === true) {
    fact.unreadable = true;
  }
  if (fm.unparseable === true) {
    fact.unparseableFrontmatter = true;
  }
  return fact;
}

/**
 * `.kiro/agents` or `~/.kiro/agents`. Nested directories count. Dotfiles and
 * other extensions do not. JSON and Markdown are both inventory; neither
 * uses the Claude agent schema. See docs/spec/kiro-agents.md.
 */
export function discoverKiroAgentsDir(dir: string, io: ScanIO): AgentFact[] {
  const facts: AgentFact[] = [];
  for (const rel of agentFiles(dir, io)) {
    const name = kiroAgentName(rel);
    if (name === undefined) {
      continue;
    }
    const filePath = join(dir, rel);
    if (!isFile(filePath)) {
      continue;
    }
    facts.push(readKiroAgent(filePath, name, dir, io));
  }
  return facts;
}

/**
 * Same name at a higher hop loses. Equal hops (a `.json` and a `.md` in one
 * directory) both stay. The page says workspace wins over global and does
 * not say which workspace layer wins, so the nearer start directory does.
 */
function shadowFartherKiroAgents(pending: { fact: AgentFact; hops: number }[]): AgentFact[] {
  const nearest = new Map<string, number>();
  for (const item of pending) {
    const prev = nearest.get(item.fact.name);
    if (prev === undefined || item.hops < prev) {
      nearest.set(item.fact.name, item.hops);
    }
  }
  return pending.map((item) => {
    const best = nearest.get(item.fact.name) ?? item.hops;
    if (item.hops > best) {
      return { ...item.fact, effective: false };
    }
    return item.fact;
  });
}

const CODEX_AGENT_REQUIRED = ["name", "description", "developer_instructions"] as const;

/**
 * Codex custom agents: `*.toml` directly in `.codex/agents` or `$CODEX_HOME/agents`.
 * Each must define string `name`, `description`, `developer_instructions`.
 * See docs/spec/codex-agents.md.
 */
export function discoverCodexAgentsDir(dir: string, io: ScanIO): AgentFact[] {
  const facts: AgentFact[] = [];
  for (const entry of listDir(dir, io, { optional: true }) ?? []) {
    if (entry.name.startsWith(".") || !entry.name.endsWith(".toml")) {
      continue;
    }
    const filePath = join(dir, entry.name);
    if (!isFile(filePath)) {
      continue;
    }
    const fact: AgentFact = {
      name: entry.name.slice(0, -".toml".length),
      path: filePath,
      sourceProvider: "codex",
      namespace: dir,
      nameSource: "filename",
      hasFrontmatter: false,
    };
    const value = readConfigFile(filePath, io);
    if (value === undefined) {
      fact.unreadable = true;
    } else if (!isRecord(value)) {
      reportRootShapeOnce(filePath, io, "Codex agent root is not a table");
      fact.unreadable = true;
    } else {
      if (typeof value.name === "string") {
        fact.name = value.name;
        fact.nameSource = "frontmatter";
      }
      const missing = CODEX_AGENT_REQUIRED.filter((key) => typeof value[key] !== "string");
      if (missing.length > 0) {
        fact.codexMissingFields = missing;
      }
    }
    facts.push(fact);
  }
  return facts;
}

/**
 * Claude: every `.claude/agents` from startDir up to root (docs/spec/claude-subagents.md).
 * VS Code: `.github/agents` (docs/spec/vscode-agents.md).
 * Command Code: `<commandcodeProjectRoot>/.commandcode/agents/*.md` only;
 * user dir under `--global`. Nested package `.commandcode/agents` is not
 * Command Code project config.
 * Kiro: `.kiro/agents` on that same walk, plus `~/.kiro/agents` under `--global`.
 * Codex: `.codex/agents` on that walk, plus `$CODEX_HOME/agents` under `--global`.
 */
export function discoverAgents(
  root: string,
  io: ScanIO,
  startDir = root,
  includeGlobal = false,
  commandcodeProjectRoot = root,
): AgentFact[] {
  const facts: AgentFact[] = [];
  const kiroPending: { fact: AgentFact; hops: number }[] = [];
  const seenDirs = new Set<string>();
  const ancestors = ancestorDirsInclusive(startDir, root);
  for (const [hop, dir] of ancestors.entries()) {
    const agentsDir = join(dir, ".claude", "agents");
    if (!seenDirs.has(agentsDir)) {
      seenDirs.add(agentsDir);
      facts.push(...discoverClaudeAgentsDir(agentsDir, root, io));
      facts.push(...discoverVscodeAgents(dir, io));
    }
    for (const fact of discoverKiroAgentsDir(join(dir, ".kiro", "agents"), io)) {
      kiroPending.push({ fact, hops: hop });
    }
    facts.push(...discoverCodexAgentsDir(join(dir, ".codex", "agents"), io));
  }
  facts.push(...discoverCommandcodeAgents(commandcodeProjectRoot, includeGlobal, io));
  if (includeGlobal) {
    // Scanning `~` itself already walked `~/.claude/agents` and `~/.kiro/agents`.
    const claudeGlobal = join(providerHome("claude"), "agents");
    if (!seenDirs.has(claudeGlobal)) {
      facts.push(...discoverClaudeAgentsDir(claudeGlobal, root, io));
    }
    const codexGlobal = join(providerHome("codex"), "agents");
    if (!ancestors.some((dir) => join(dir, ".codex", "agents") === codexGlobal)) {
      facts.push(...discoverCodexAgentsDir(codexGlobal, io));
    }
    const kiroGlobal = join(providerHome("kiro"), "agents");
    if (!ancestors.some((dir) => join(dir, ".kiro", "agents") === kiroGlobal)) {
      for (const fact of discoverKiroAgentsDir(kiroGlobal, io)) {
        kiroPending.push({ fact, hops: KIRO_GLOBAL_HOPS });
      }
    }
  }
  facts.push(...shadowFartherKiroAgents(kiroPending));
  return facts;
}
