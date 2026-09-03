import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { claudeConfigDir } from "../facts/claude";
import type { ConfigErrorFact, SlashCommandFact } from "../facts/types";
import { hooksFromObject } from "./hooks";
import { ancestorDirsInclusive, readFrontmatter } from "./shared";

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function commandFiles(dir: string, errors: ConfigErrorFact[]): string[] {
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
  const out: string[] = [];
  for (const name of names) {
    if (name.startsWith(".")) {
      continue;
    }
    const abs = join(dir, name);
    if (isDirectory(abs)) {
      out.push(...commandFiles(abs, errors).map((rel) => join(name, rel)));
      continue;
    }
    if (name.endsWith(".md") && isFile(abs)) {
      out.push(name);
    }
  }
  return out;
}

/**
 * Flat markdown commands. Invoke by filename. Same hook shape as skills.
 * See docs/spec/skills.md.
 */
export function discoverClaudeCommandsInDir(
  dir: string,
  source: "project" | "global",
  projectRoot: string,
  errors: ConfigErrorFact[],
): SlashCommandFact[] {
  if (!existsSync(dir)) {
    return [];
  }
  const facts: SlashCommandFact[] = [];
  for (const rel of commandFiles(dir, errors)) {
    const filePath = join(dir, rel);
    const fact: SlashCommandFact = {
      name: basename(rel, ".md"),
      path: filePath,
      source,
      sourceProvider: "claude",
    };
    const fm = readFrontmatter(filePath, errors);
    if (fm.hooks !== undefined) {
      const hooks = hooksFromObject(
        fm.hooks,
        filePath,
        "skill",
        { project: projectRoot, own: dirname(filePath) },
        errors,
      );
      if (hooks.length > 0) {
        fact.frontmatterHooks = hooks.map((hook) => ({
          ...hook,
          sourceProvider: "claude",
        }));
      }
    }
    facts.push(fact);
  }
  return facts;
}

/**
 * Walk-up `.claude/commands`. User dir only under `--global`.
 * See docs/spec/skills.md.
 */
export function discoverClaudeCommands(
  startDir: string,
  scanBoundary: string,
  includeGlobal: boolean,
  projectRoot: string,
  errors: ConfigErrorFact[],
): SlashCommandFact[] {
  const facts: SlashCommandFact[] = [];
  const seen = new Set<string>();
  const add = (batch: SlashCommandFact[]): void => {
    for (const fact of batch) {
      const key = resolve(fact.path);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      facts.push(fact);
    }
  };
  for (const dir of ancestorDirsInclusive(startDir, scanBoundary)) {
    add(discoverClaudeCommandsInDir(join(dir, ".claude", "commands"), "project", projectRoot, errors));
  }
  if (includeGlobal) {
    add(discoverClaudeCommandsInDir(join(claudeConfigDir(), "commands"), "global", projectRoot, errors));
  }
  return facts;
}
