import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { AgentFact, ConfigErrorFact } from "../facts/types";
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
export function discoverAgents(root: string, errors: ConfigErrorFact[]): AgentFact[] {
  const dir = join(root, ".claude", "agents");
  if (!existsSync(dir)) {
    return [];
  }
  const entries = agentFiles(dir, errors);
  const facts: AgentFact[] = [];
  for (const name of entries) {
    // Agent definitions are markdown; .gitkeep and .DS_Store are not agents,
    // and counting them inflates the budget.agents rule. Dotfiles are already
    // filtered by agentFiles, including in nested directories.
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
    const fm = readFrontmatter(filePath, errors);
    const fact: AgentFact = {
      name: name.slice(0, -".md".length),
      path: filePath,
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
    facts.push(fact);
  }
  return facts;
}
