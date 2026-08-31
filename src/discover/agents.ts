import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AgentFact, ConfigErrorFact } from "../facts/types";
import { discoverCommandcodeAgents } from "./commandcode";
import { ancestorDirsInclusive } from "./shared";
import { hooksFromObject } from "./hooks";
import { readFrontmatter } from "./shared";

/** Agent definitions nest, so a one-level scan misses `agents/review/x.md`. */
function agentFiles(dir: string, errors: ConfigErrorFact[]): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir, { withFileTypes: true }).map((e) =>
      e.isDirectory() ? `${e.name}/` : e.name,
    );
  } catch (err) {
    errors.push({
      path: dir,
      kind: "unreadable",
      detail: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    if (entry.startsWith(".")) {
      continue;
    }
    if (entry.endsWith("/")) {
      out.push(
        ...agentFiles(join(dir, entry.slice(0, -1)), errors).map((p) =>
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
  errors: ConfigErrorFact[],
): AgentFact {
  const fm = readFrontmatter(filePath, errors);
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
  if (fm.hooks !== undefined) {
    const hooks = hooksFromObject(fm.hooks, filePath, "agent", {
      project: root,
      own: dirname(filePath),
    }, errors);
    if (hooks.length > 0) {
      fact.frontmatterHooks = hooks.map((h) => ({ ...h, sourceProvider: "claude" }));
    }
  }
  return fact;
}

function discoverClaudeAgentsDir(
  dir: string,
  root: string,
  errors: ConfigErrorFact[],
): AgentFact[] {
  if (!existsSync(dir)) {
    return [];
  }
  const entries = agentFiles(dir, errors);
  const facts: AgentFact[] = [];
  for (const name of entries) {
    if (!name.endsWith(".md")) {
      continue;
    }
    const filePath = join(dir, name);
    try {
      const st = statSync(filePath);
      if (!st.isFile()) {
        continue;
      }
    } catch {
      continue;
    }
    facts.push(readClaudeAgent(filePath, name, root, dir, errors));
  }
  return facts;
}

function discoverVscodeAgents(root: string, errors: ConfigErrorFact[]): AgentFact[] {
  const dir = join(root, ".github", "agents");
  if (!existsSync(dir)) {
    return [];
  }
  const facts: AgentFact[] = [];
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch (err) {
    errors.push({
      path: dir,
      kind: "unreadable",
      detail: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
  for (const name of names) {
    if (name.startsWith(".")) {
      continue;
    }
    if (!name.endsWith(".agent.md") && !name.endsWith(".md")) {
      continue;
    }
    const filePath = join(dir, name);
    try {
      if (!statSync(filePath).isFile()) {
        continue;
      }
    } catch {
      continue;
    }
    const fm = readFrontmatter(filePath, errors);
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
      const hooks = hooksFromObject(fm.hooks, filePath, "agent", {
        project: root,
        own: dirname(filePath),
      }, errors);
      if (hooks.length > 0) {
        fact.frontmatterHooks = hooks.map((h) => ({ ...h, sourceProvider: "vscode" }));
      }
    }
    facts.push(fact);
  }
  return facts;
}

/**
 * Claude: every `.claude/agents` from startDir up to root (docs/spec/claude-subagents.md).
 * VS Code: `.github/agents` (docs/spec/vscode-agents.md).
 * Command Code: `.commandcode/agents/*.md` one level; user dir under `--global`.
 */
export function discoverAgents(
  root: string,
  errors: ConfigErrorFact[],
  startDir = root,
  includeGlobal = false,
): AgentFact[] {
  const facts: AgentFact[] = [];
  const seenDirs = new Set<string>();
  for (const dir of ancestorDirsInclusive(startDir, root)) {
    const agentsDir = join(dir, ".claude", "agents");
    if (seenDirs.has(agentsDir)) {
      continue;
    }
    seenDirs.add(agentsDir);
    facts.push(...discoverClaudeAgentsDir(agentsDir, root, errors));
    facts.push(...discoverVscodeAgents(dir, errors));
  }
  facts.push(...discoverCommandcodeAgents(root, includeGlobal, errors, startDir));
  return facts;
}
