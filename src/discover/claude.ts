import { basename, dirname, join, resolve } from "node:path";
import { providerHome } from "../facts/providers";
import type { SlashCommandFact } from "../facts/types";
import { hooksFromObject } from "./hooks";
import { ancestorDirsInclusive } from "./scan-context";
import { readFrontmatter } from "./frontmatter";
import { isDirectory, isFile, listDir, type ScanIO } from "./fs";

/** Markdown command files below `dir`, as paths relative to it. */
export function commandFiles(dir: string, io: ScanIO): string[] {
  const out: string[] = [];
  for (const { name } of listDir(dir, io, { optional: true }) ?? []) {
    if (name.startsWith(".")) {
      continue;
    }
    const abs = join(dir, name);
    if (isDirectory(abs)) {
      out.push(...commandFiles(abs, io).map((rel) => join(name, rel)));
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
  io: ScanIO,
): SlashCommandFact[] {
  const facts: SlashCommandFact[] = [];
  for (const rel of commandFiles(dir, io)) {
    const filePath = join(dir, rel);
    const fact: SlashCommandFact = {
      name: basename(rel, ".md"),
      path: filePath,
      source,
      sourceProvider: "claude",
    };
    const fm = readFrontmatter(filePath, io);
    if (fm.hooks !== undefined) {
      const hooks = hooksFromObject(
        fm.hooks,
        filePath,
        "skill",
        { project: projectRoot, own: dirname(filePath) },
        io,
        { sourceProvider: "claude", schemaProfile: "claude" },
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
  io: ScanIO,
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
    add(discoverClaudeCommandsInDir(join(dir, ".claude", "commands"), "project", projectRoot, io));
  }
  if (includeGlobal) {
    add(discoverClaudeCommandsInDir(join(providerHome("claude"), "commands"), "global", projectRoot, io));
  }
  return facts;
}
