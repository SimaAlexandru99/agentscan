import { isFile, listDir, type ScanIO } from "./fs";
import { dirname, join } from "node:path";
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

/**
 * Claude: every `.claude/agents` from startDir up to root (docs/spec/claude-subagents.md).
 * VS Code: `.github/agents` (docs/spec/vscode-agents.md).
 * Command Code: `<commandcodeProjectRoot>/.commandcode/agents/*.md` only;
 * user dir under `--global`. Nested package `.commandcode/agents` is not
 * Command Code project config.
 */
export function discoverAgents(
  root: string,
  io: ScanIO,
  startDir = root,
  includeGlobal = false,
  commandcodeProjectRoot = root,
): AgentFact[] {
  const facts: AgentFact[] = [];
  const seenDirs = new Set<string>();
  for (const dir of ancestorDirsInclusive(startDir, root)) {
    const agentsDir = join(dir, ".claude", "agents");
    if (seenDirs.has(agentsDir)) {
      continue;
    }
    seenDirs.add(agentsDir);
    facts.push(...discoverClaudeAgentsDir(agentsDir, root, io));
    facts.push(...discoverVscodeAgents(dir, io));
  }
  facts.push(...discoverCommandcodeAgents(commandcodeProjectRoot, includeGlobal, io));
  if (includeGlobal) {
    facts.push(...discoverClaudeAgentsDir(join(providerHome("claude"), "agents"), root, io));
  }
  return facts;
}
