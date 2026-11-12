import { basename, dirname, join } from "node:path";
import { toPosix } from "../facts/paths";
import { providerHome } from "../facts/providers";
import { splitFrontmatter } from "./frontmatter";
import type { Provider } from "../facts/provider";
import type { RuleFact, WindsurfRuleScope } from "../facts/types";
import { NESTED_DISCOVERY_MAX_DEPTH, POLICY_CAP, walkFiles } from "./shared";
import { readCapped, type ScanIO } from "./fs";
import { lineCount } from "../facts/text";

/**
 * Workspace Windsurf rules declare `trigger` in frontmatter.
 * See docs/spec/windsurf-rules.md.
 */
function windsurfWorkspaceTrigger(
  text: string,
): "yes" | "no" | "unreadable" {
  const split = splitFrontmatter(text);
  if (split.kind === "none") {
    return "no";
  }
  if (split.kind !== "ok") {
    return "unreadable";
  }
  const trigger = split.record.trigger;
  return typeof trigger === "string" && trigger.trim().length > 0 ? "yes" : "no";
}

function readRuleFile(
  path: string,
  sourceProvider: Provider,
  io: ScanIO,
  extras?: {
    windsurfScope?: WindsurfRuleScope;
  },
): RuleFact | undefined {
  const result = readCapped(path, POLICY_CAP, io, { optional: true });
  if (result === undefined) {
    return undefined;
  }
  const text = result.text;
  const windsurfScope = extras?.windsurfScope;
  const trigger =
    windsurfScope === "workspace" ? windsurfWorkspaceTrigger(text) : undefined;
  if (trigger === "unreadable") {
    io.errors.push({
      path,
      kind: "unexpected-shape",
      detail: "Windsurf rule frontmatter is not valid YAML",
    });
  }
  return {
    path,
    sourceProvider,
    lineCount: lineCount(text),
    byteLength: result.byteLength,
    charCount: text.length,
    ...(windsurfScope === undefined ? {} : { windsurfScope }),
    ...(trigger === undefined ? {} : { windsurfTrigger: trigger }),
  };
}

function collectMdRules(
  dir: string,
  sourceProvider: Provider,
  io: ScanIO,
  extras?: { windsurfScope?: WindsurfRuleScope },
): RuleFact[] {
  const out: RuleFact[] = [];
  for (const abs of walkFiles(dir, {
    maxDepth: NESTED_DISCOVERY_MAX_DEPTH,
    match: (_abs, name) => name.endsWith(".md"),
    io,
  })) {
    const fact = readRuleFile(abs, sourceProvider, io, extras);
    if (fact !== undefined) {
      out.push(fact);
    }
  }
  return out;
}

function isWindsurfWorkspaceRulePath(abs: string, name: string): boolean {
  if (!name.endsWith(".md")) {
    return false;
  }
  const normalized = toPosix(abs);
  return normalized.includes("/.devin/rules/") || normalized.includes("/.windsurf/rules/");
}

/**
 * Vendor rule files with vendor paths. See docs/spec/cursor-rules.md,
 * docs/spec/claude-memory.md, docs/spec/grok-rules.md, and
 * docs/spec/windsurf-rules.md. Size limits are checked separately.
 */
export function discoverRules(root: string, io: ScanIO): RuleFact[] {
  const out: RuleFact[] = [];
  const cursorRules = join(root, ".cursor", "rules");
  for (const abs of walkFiles(cursorRules, {
    maxDepth: NESTED_DISCOVERY_MAX_DEPTH,
    match: (_abs, name) => name.endsWith(".mdc"),
    io,
  })) {
    const fact = readRuleFile(abs, "cursor", io);
    if (fact !== undefined) {
      out.push(fact);
    }
  }
  out.push(...collectMdRules(join(root, ".grok", "rules"), "grok", io));
  out.push(...collectMdRules(join(root, ".claude", "rules"), "claude", io));
  out.push(
    ...collectMdRules(join(root, ".devin", "rules"), "windsurf", io, {
      windsurfScope: "workspace",
    }),
  );
  out.push(
    ...collectMdRules(join(root, ".windsurf", "rules"), "windsurf", io, {
      windsurfScope: "workspace",
    }),
  );
  const legacy = join(root, ".windsurfrules");
  const legacyFact = readRuleFile(legacy, "windsurf", io, { windsurfScope: "legacy" });
  if (legacyFact !== undefined) {
    out.push(legacyFact);
  }
  return out;
}

/**
 * Subdirectory-scoped `.devin/rules` / `.windsurf/rules` under the scan tree.
 * Ancestor dirs are also collected by `discoverRules`. Dedup by path at the
 * caller. See docs/spec/windsurf-rules.md.
 */
export function discoverNestedWindsurfRules(
  scanBoundary: string,
  io: ScanIO,
): RuleFact[] {
  const out: RuleFact[] = [];
  for (const abs of walkFiles(scanBoundary, {
    maxDepth: NESTED_DISCOVERY_MAX_DEPTH,
    match: isWindsurfWorkspaceRulePath,
    io,
  })) {
    const fact = readRuleFile(abs, "windsurf", io, { windsurfScope: "workspace" });
    if (fact !== undefined) {
      out.push(fact);
    }
  }
  return out;
}

/**
 * User `~/.claude/rules/` (or `$CLAUDE_CONFIG_DIR/rules`). `--global` only.
 * See docs/spec/claude-memory.md.
 */
export function discoverClaudeUserRules(io: ScanIO): RuleFact[] {
  return collectMdRules(join(providerHome("claude"), "rules"), "claude", io);
}

/**
 * Only the quoted global file. Do not glob `~/.codeium/windsurf/memories/`.
 * See docs/spec/windsurf-rules.md.
 */
export function discoverWindsurfGlobalRules(
  filePath: string,
  io: ScanIO,
): RuleFact[] {
  if (basename(filePath) !== "global_rules.md") {
    return [];
  }
  if (basename(dirname(filePath)) !== "memories") {
    return [];
  }
  const fact = readRuleFile(filePath, "windsurf", io, { windsurfScope: "global" });
  return fact === undefined ? [] : [fact];
}
