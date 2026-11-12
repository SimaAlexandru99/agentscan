import { basename, dirname, join } from "node:path";
import { toPosix } from "../facts/paths";
import { providerHome } from "../facts/providers";
import { splitFrontmatter } from "./frontmatter";
import type { Provider } from "../facts/provider";
import type { AntigravityRuleDefect, RuleFact, WindsurfRuleScope } from "../facts/types";
import { NESTED_DISCOVERY_MAX_DEPTH, POLICY_CAP, walkFiles } from "./shared";
import { isRecord, listDir, readCapped, readConfigFile, reportRootShapeOnce, type ScanIO } from "./fs";
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

const ANTIGRAVITY_TRIGGERS = new Set(["always_on", "model_decision", "glob", "manual"]);

function nonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * One directory level of `*.md`. Nested subdirs stay unread: the page says
 * `rules.json` is how those are included, and this scanner does not follow it.
 */
function listOneLevelMd(dir: string, io: ScanIO): string[] {
  const entries = listDir(dir, io, { optional: true });
  if (entries === undefined) {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith(".") || !entry.name.endsWith(".md")) {
      continue;
    }
    out.push(join(dir, entry.name));
  }
  return out;
}

/**
 * Modular rules only. Bad YAML is one unexpected-shape and no defect, so a
 * parse failure is not also "missing trigger".
 */
function antigravityModularDefect(
  path: string,
  text: string,
  io: ScanIO,
): AntigravityRuleDefect | undefined {
  const split = splitFrontmatter(text);
  if (split.kind === "unclosed" || split.kind === "invalid" || split.kind === "not-mapping") {
    io.errors.push({
      path,
      kind: "unexpected-shape",
      detail: "Antigravity rule frontmatter is not valid YAML",
    });
    return undefined;
  }
  if (split.kind !== "ok") {
    return "missing-trigger";
  }
  const trigger = split.record.trigger;
  if (trigger === undefined || (typeof trigger === "string" && trigger.trim().length === 0)) {
    return "missing-trigger";
  }
  if (typeof trigger !== "string" || !ANTIGRAVITY_TRIGGERS.has(trigger.trim())) {
    return "invalid-trigger";
  }
  const mode = trigger.trim();
  if (mode === "model_decision" && !nonEmptyString(split.record.description)) {
    return "missing-description";
  }
  if (mode === "glob" && !nonEmptyString(split.record.globs) && !nonEmptyString(split.record.glob)) {
    return "missing-globs";
  }
  return undefined;
}

function readAntigravityRule(
  path: string,
  io: ScanIO,
  kind: "standalone" | "modular",
): RuleFact | undefined {
  const result = readCapped(path, POLICY_CAP, io, { optional: true });
  if (result === undefined) {
    return undefined;
  }
  const defect = kind === "modular" ? antigravityModularDefect(path, result.text, io) : undefined;
  return {
    path,
    sourceProvider: "antigravity",
    lineCount: lineCount(result.text),
    byteLength: result.byteLength,
    charCount: result.text.length,
    ...(defect === undefined ? {} : { antigravityDefect: defect }),
  };
}

/**
 * `<dir>/.agents/rules.json` only. Inventory the shape. Do not follow
 * `inherits` or `entries[].path`. See docs/spec/antigravity-rules.md.
 */
function readAntigravityRulesJson(path: string, io: ScanIO): void {
  const value = readConfigFile(path, io, { optional: true });
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    reportRootShapeOnce(path, io, "Antigravity rules.json root is not an object");
    return;
  }
  if ("entries" in value && !Array.isArray(value.entries)) {
    io.errors.push({
      path,
      kind: "unexpected-shape",
      detail: "`entries` is not an array",
    });
  }
}

function pushAntigravity(out: RuleFact[], fact: RuleFact | undefined): void {
  if (fact !== undefined) {
    out.push(fact);
  }
}

/**
 * Vendor rule files with vendor paths. See docs/spec/cursor-rules.md,
 * docs/spec/claude-memory.md, docs/spec/grok-rules.md,
 * docs/spec/windsurf-rules.md, and docs/spec/antigravity-rules.md.
 * Size limits are checked separately.
 *
 * Antigravity workspace `AGENTS.md` stays a policy file. `GEMINI.md` is a
 * rule. Modular rules are one directory level, not a descendant walk.
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
  pushAntigravity(out, readAntigravityRule(join(root, "GEMINI.md"), io, "standalone"));
  pushAntigravity(out, readAntigravityRule(join(root, ".agents", "GEMINI.md"), io, "standalone"));
  for (const dir of [join(root, ".agents", "rules"), join(root, ".agent", "rules")]) {
    for (const abs of listOneLevelMd(dir, io)) {
      pushAntigravity(out, readAntigravityRule(abs, io, "modular"));
    }
  }
  readAntigravityRulesJson(join(root, ".agents", "rules.json"), io);
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

/**
 * Standalone global files and `~/.gemini/config/rules/*.md`. `--global` only.
 * No global `rules.json`. See docs/spec/antigravity-rules.md.
 */
export function discoverAntigravityUserRules(io: ScanIO): RuleFact[] {
  const out: RuleFact[] = [];
  const geminiHome = providerHome("gemini");
  const configHome = providerHome("antigravity");
  for (const path of [
    join(geminiHome, "GEMINI.md"),
    join(geminiHome, "AGENTS.md"),
    join(configHome, "GEMINI.md"),
    join(configHome, "AGENTS.md"),
  ]) {
    pushAntigravity(out, readAntigravityRule(path, io, "standalone"));
  }
  for (const abs of listOneLevelMd(join(configHome, "rules"), io)) {
    pushAntigravity(out, readAntigravityRule(abs, io, "modular"));
  }
  return out;
}
