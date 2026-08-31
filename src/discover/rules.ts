import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { Provider } from "../facts/provider";
import type { ConfigErrorFact, RuleFact, WindsurfRuleScope } from "../facts/types";
import {
  NESTED_DISCOVERY_MAX_DEPTH,
  POLICY_CAP,
  readCapped,
  walkFiles,
} from "./shared";

function lineCount(text: string): number {
  return text.length === 0 ? 0 : text.replace(/\r?\n$/, "").split(/\r?\n/).length;
}

/**
 * Workspace Windsurf rules declare `trigger` in frontmatter.
 * See docs/spec/windsurf-rules.md.
 */
function windsurfWorkspaceTrigger(
  text: string,
): "yes" | "no" | "unreadable" {
  let body = text;
  if (body.charCodeAt(0) === 0xfeff) {
    body = body.slice(1);
  }
  body = body.replace(/\r\n/g, "\n");
  if (!body.startsWith("---")) {
    return "no";
  }
  const fence = /\n(?:---|\.\.\.)[ \t]*(?:\n|$)/.exec(body.slice(3));
  if (fence === null) {
    return "unreadable";
  }
  try {
    const block = parseYaml(body.slice(3, 3 + fence.index)) as unknown;
    if (block === null || typeof block !== "object" || Array.isArray(block)) {
      return "unreadable";
    }
    const trigger = (block as Record<string, unknown>).trigger;
    return typeof trigger === "string" && trigger.trim().length > 0 ? "yes" : "no";
  } catch {
    return "unreadable";
  }
}

export function readRuleFile(
  path: string,
  sourceProvider: Provider,
  errors: ConfigErrorFact[],
  extras?: {
    windsurfScope?: WindsurfRuleScope;
  },
): RuleFact | undefined {
  try {
    const result = readCapped(path, POLICY_CAP);
    const text = result.buf.subarray(0, POLICY_CAP).toString("utf8");
    if (result.truncated) {
      errors.push({
        path,
        kind: "truncated",
        detail: `file exceeds ${POLICY_CAP} byte scan cap`,
      });
    }
    const windsurfScope = extras?.windsurfScope;
    const trigger =
      windsurfScope === "workspace" ? windsurfWorkspaceTrigger(text) : undefined;
    if (trigger === "unreadable") {
      errors.push({
        path,
        kind: "unexpected-shape",
        detail: "Windsurf rule frontmatter is not valid YAML",
      });
    }
    return {
      path,
      sourceProvider,
      lineCount: lineCount(text),
      byteLength: result.buf.length,
      charCount: text.length,
      ...(windsurfScope === undefined ? {} : { windsurfScope }),
      ...(trigger === "yes" ? { windsurfHasTrigger: true } : {}),
      ...(trigger === "no" ? { windsurfHasTrigger: false } : {}),
      ...(trigger === "unreadable" ? { windsurfTriggerUnreadable: true } : {}),
    };
  } catch (err) {
    errors.push({
      path,
      kind: "unreadable",
      detail: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

function collectMdRules(
  dir: string,
  sourceProvider: Provider,
  errors: ConfigErrorFact[],
  extras?: { windsurfScope?: WindsurfRuleScope },
): RuleFact[] {
  const out: RuleFact[] = [];
  if (!existsSync(dir)) {
    return out;
  }
  for (const abs of walkFiles(dir, {
    maxDepth: NESTED_DISCOVERY_MAX_DEPTH,
    match: (_abs, name) => name.endsWith(".md"),
    errors,
  })) {
    const fact = readRuleFile(abs, sourceProvider, errors, extras);
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
  const normalized = abs.replaceAll("\\", "/");
  return normalized.includes("/.devin/rules/") || normalized.includes("/.windsurf/rules/");
}

/**
 * Vendor rule files with vendor paths. See docs/spec/cursor-rules.md,
 * docs/spec/claude-memory.md, docs/spec/grok-rules.md, and
 * docs/spec/windsurf-rules.md. Size limits are checked separately.
 */
export function discoverRules(root: string, errors: ConfigErrorFact[]): RuleFact[] {
  const out: RuleFact[] = [];
  const cursorRules = join(root, ".cursor", "rules");
  if (existsSync(cursorRules)) {
    for (const abs of walkFiles(cursorRules, {
      maxDepth: NESTED_DISCOVERY_MAX_DEPTH,
      match: (_abs, name) => name.endsWith(".mdc"),
      errors,
    })) {
      const fact = readRuleFile(abs, "cursor", errors);
      if (fact !== undefined) {
        out.push(fact);
      }
    }
  }
  out.push(...collectMdRules(join(root, ".grok", "rules"), "grok", errors));
  out.push(...collectMdRules(join(root, ".claude", "rules"), "claude", errors));
  out.push(
    ...collectMdRules(join(root, ".devin", "rules"), "windsurf", errors, {
      windsurfScope: "workspace",
    }),
  );
  out.push(
    ...collectMdRules(join(root, ".windsurf", "rules"), "windsurf", errors, {
      windsurfScope: "workspace",
    }),
  );
  const legacy = join(root, ".windsurfrules");
  if (existsSync(legacy) && basename(legacy) === ".windsurfrules") {
    const fact = readRuleFile(legacy, "windsurf", errors, { windsurfScope: "legacy" });
    if (fact !== undefined) {
      out.push(fact);
    }
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
  errors: ConfigErrorFact[],
): RuleFact[] {
  const out: RuleFact[] = [];
  for (const abs of walkFiles(scanBoundary, {
    maxDepth: NESTED_DISCOVERY_MAX_DEPTH,
    match: isWindsurfWorkspaceRulePath,
    errors,
  })) {
    const fact = readRuleFile(abs, "windsurf", errors, { windsurfScope: "workspace" });
    if (fact !== undefined) {
      out.push(fact);
    }
  }
  return out;
}

/**
 * Only the quoted global file. Do not glob `~/.codeium/windsurf/memories/`.
 * See docs/spec/windsurf-rules.md.
 */
export function discoverWindsurfGlobalRules(
  filePath: string,
  errors: ConfigErrorFact[],
): RuleFact[] {
  if (!existsSync(filePath) || basename(filePath) !== "global_rules.md") {
    return [];
  }
  if (basename(dirname(filePath)) !== "memories") {
    return [];
  }
  const fact = readRuleFile(filePath, "windsurf", errors, { windsurfScope: "global" });
  return fact === undefined ? [] : [fact];
}
