import { existsSync } from "node:fs";
import { join } from "node:path";
import { FACTORY_DROID_NAME } from "../facts/factory";
import { providerHome } from "../facts/providers";
import type { AgentFact, HookFact, McpFact } from "../facts/types";
import { readFrontmatter } from "./frontmatter";
import { hooksFromObject, readHooksDocument, readHooksFile } from "./hooks";
import { isFile, isRecord, listDir, type ScanIO } from "./fs";
import { parseProfiledMcpFile } from "./mcp";

/**
 * Standalone hook file: event keys at the root, no `hooks` wrapper. The legacy
 * file's wrapping is not documented, so only there a `hooks` record is unwrapped.
 */
function standaloneHooks(filePath: string, projectRoot: string, io: ScanIO, unwrap: boolean): HookFact[] {
  const doc = readHooksDocument(filePath, io);
  if (doc === undefined) {
    return [];
  }
  return hooksFromObject(unwrap && isRecord(doc.hooks) ? doc.hooks : doc, filePath, "factory-hooks", { project: projectRoot }, io, {
    sourceProvider: "factory",
    schemaProfile: "factory",
  });
}

/**
 * `hooks.json` (and the project's legacy `hooks/hooks.json`); only when neither
 * exists, the `hooks` key of `settings.json`. See docs/spec/factory-hooks.md.
 */
function factoryHooks(factoryDir: string, projectRoot: string, io: ScanIO, legacy: boolean): HookFact[] {
  const files = [join(factoryDir, "hooks.json"), ...(legacy ? [join(factoryDir, "hooks", "hooks.json")] : [])];
  if (!files.some((file) => existsSync(file))) {
    return readHooksFile(
      join(factoryDir, "settings.json"),
      { source: "settings", sourceProvider: "factory", profile: "factory" },
      { project: projectRoot },
      io,
    );
  }
  return files.flatMap((file, index) => standaloneHooks(file, projectRoot, io, index > 0));
}

function factoryMcp(factoryDir: string, projectRoot: string, io: ScanIO): McpFact[] {
  return parseProfiledMcpFile(join(factoryDir, "mcp.json"), projectRoot, io, "factory-json", { optional: true });
}

/** Project `.factory/`. Called once per walk-up directory, which covers ancestor `mcp.json`. */
export function discoverFactoryProject(dir: string, io: ScanIO): { hooks: HookFact[]; mcp: McpFact[] } {
  const root = join(dir, ".factory");
  return { hooks: factoryHooks(root, dir, io, true), mcp: factoryMcp(root, dir, io) };
}

/** User `~/.factory/`. Only called under `--global`. */
export function discoverFactoryUser(projectRoot: string, io: ScanIO): { hooks: HookFact[]; mcp: McpFact[] } {
  const home = providerHome("factory");
  return { hooks: factoryHooks(home, projectRoot, io, false), mcp: factoryMcp(home, projectRoot, io) };
}

/**
 * Custom droids: `*.md` at the top level of `droids/`. `name` is required and
 * must match `^[a-z0-9-_]+$`; the body is the system prompt and cannot be
 * empty. See docs/spec/factory-agents.md.
 */
export function discoverFactoryDroidsDir(dir: string, io: ScanIO): AgentFact[] {
  const facts: AgentFact[] = [];
  for (const { name } of listDir(dir, io, { optional: true }) ?? []) {
    const filePath = join(dir, name);
    if (name.startsWith(".") || !name.endsWith(".md") || !isFile(filePath)) {
      continue;
    }
    const fm = readFrontmatter(filePath, io);
    const fact: AgentFact = {
      name: fm.name ?? name.slice(0, -".md".length),
      path: filePath,
      sourceProvider: "factory",
      namespace: dir,
      nameSource: fm.name === undefined ? "filename" : "frontmatter",
      hasFrontmatter: fm.hasFrontmatter,
    };
    if (fm.unreadable === true || fm.unparseable === true) {
      // Fields are unknown, not absent.
      fact.unreadable = true;
      facts.push(fact);
      continue;
    }
    const defects: NonNullable<AgentFact["factoryDroidDefects"]> = [];
    if (fm.name === undefined || !FACTORY_DROID_NAME.test(fm.name)) {
      defects.push("invalid-name");
    }
    if ((fm.body ?? "").trim().length === 0) {
      defects.push("empty-body");
    }
    if (defects.length > 0) {
      fact.factoryDroidDefects = defects;
    }
    facts.push(fact);
  }
  return facts;
}
