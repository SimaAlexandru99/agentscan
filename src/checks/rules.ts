import { assertNever, type Provider } from "../facts/provider";
import type { Facts, Finding, RuleFact } from "../facts/types";
import { make } from "./make";

const CURSOR_RULE_LINE_LIMIT = 500;

function lineLimitFor(provider: Provider): number | undefined {
  switch (provider) {
    case "cursor":
      return CURSOR_RULE_LINE_LIMIT;
    case "agent-skills":
    case "claude":
    case "codex":
    case "vscode":
    case "grok":
    case "antigravity":
    case "gemini":
    case "windsurf":
    case "kiro":
    case "cline":
    case "roo":
    case "kilo":
    case "opencode":
    case "junie":
    case "continue":
    case "unknown":
      return undefined;
    default: {
      return assertNever(provider, `unhandled rules provider: ${provider}`);
    }
  }
}

function tooLargeRuleId(provider: Provider): string | undefined {
  switch (provider) {
    case "cursor":
      return "cursor.rule.too-large";
    case "agent-skills":
    case "claude":
    case "codex":
    case "vscode":
    case "grok":
    case "antigravity":
    case "gemini":
    case "windsurf":
    case "kiro":
    case "cline":
    case "roo":
    case "kilo":
    case "opencode":
    case "junie":
    case "continue":
    case "unknown":
      return undefined;
    default: {
      return assertNever(provider, `unhandled rules provider: ${provider}`);
    }
  }
}

/**
 * Vendor rule-file size checks. Only limits quoted in docs/spec/ are emitted.
 * Claude `.claude/rules` is inventoried and has no published line budget.
 */
export function checkRules(facts: Facts): Finding[] {
  const out: Finding[] = [];
  for (const rule of facts.rules ?? []) {
    const finding = tooLargeFinding(rule);
    if (finding !== undefined) {
      out.push(finding);
    }
  }
  return out;
}

function tooLargeFinding(rule: RuleFact): Finding | undefined {
  const limit = lineLimitFor(rule.sourceProvider);
  const ruleId = tooLargeRuleId(rule.sourceProvider);
  if (limit === undefined || ruleId === undefined || rule.lineCount <= limit) {
    return undefined;
  }
  return make(ruleId, `rule:${rule.path}`, {
    action: "warn",
    severity: "info",
    message: `Cursor rule is long (${rule.lineCount} lines > ${limit})`,
    reason:
      "Cursor's rules reference asks authors to keep project rules under 500 lines. That is a vendor recommendation, not a load failure. See docs/spec/cursor-rules.md.",
    evidence: [
      { kind: "rule", value: rule.path },
      { kind: "count", value: `lines=${rule.lineCount}` },
      { kind: "threshold", value: String(limit) },
    ],
    suggest: "Split or shorten the .mdc file, or ignore this info finding if the length is deliberate",
  });
}
