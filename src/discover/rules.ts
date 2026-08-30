import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Provider } from "../facts/provider";
import type { ConfigErrorFact, RuleFact } from "../facts/types";
import {
  NESTED_DISCOVERY_MAX_DEPTH,
  POLICY_CAP,
  readCapped,
  walkFiles,
} from "./shared";

function lineCount(text: string): number {
  return text.length === 0 ? 0 : text.replace(/\r?\n$/, "").split(/\r?\n/).length;
}

function readRule(
  path: string,
  sourceProvider: Provider,
  errors: ConfigErrorFact[],
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
    return {
      path,
      sourceProvider,
      lineCount: lineCount(text),
      byteLength: result.buf.length,
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

/**
 * Vendor rule files with vendor paths. See docs/spec/cursor-rules.md and
 * docs/spec/claude-memory.md. Size limits are checked separately.
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
      const fact = readRule(abs, "cursor", errors);
      if (fact !== undefined) {
        out.push(fact);
      }
    }
  }
  const claudeRules = join(root, ".claude", "rules");
  if (existsSync(claudeRules)) {
    for (const abs of walkFiles(claudeRules, {
      maxDepth: NESTED_DISCOVERY_MAX_DEPTH,
      match: (_abs, name) => name.endsWith(".md"),
      errors,
    })) {
      const fact = readRule(abs, "claude", errors);
      if (fact !== undefined) {
        out.push(fact);
      }
    }
  }
  return out;
}
