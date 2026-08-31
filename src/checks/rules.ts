import { assertNever, type Provider } from "../facts/provider";
import type { Facts, Finding, RuleFact } from "../facts/types";
import { make } from "./make";

const CURSOR_RULE_LINE_LIMIT = 500;
const WINDSURF_WORKSPACE_CHAR_LIMIT = 12_000;
const WINDSURF_GLOBAL_CHAR_LIMIT = 6_000;

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
    case "commandcode":
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
    case "commandcode":
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
 * Windsurf uses character budgets, not Cursor's 500-line recommendation.
 */
export function checkRules(facts: Facts): Finding[] {
  const out: Finding[] = [];
  for (const rule of facts.rules ?? []) {
    const finding = tooLargeFinding(rule);
    if (finding !== undefined) {
      out.push(finding);
    }
    const missing = missingTriggerFinding(rule);
    if (missing !== undefined) {
      out.push(missing);
    }
  }
  return out;
}

function tooLargeFinding(rule: RuleFact): Finding | undefined {
  if (rule.sourceProvider === "windsurf") {
    return windsurfTooLargeFinding(rule);
  }
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

function windsurfTooLargeFinding(rule: RuleFact): Finding | undefined {
  const global = rule.windsurfScope === "global";
  const limit = global ? WINDSURF_GLOBAL_CHAR_LIMIT : WINDSURF_WORKSPACE_CHAR_LIMIT;
  if (rule.charCount <= limit) {
    return undefined;
  }
  const ruleId = global ? "windsurf.rule.global-too-large" : "windsurf.rule.too-large";
  return make(ruleId, `rule:${rule.path}`, {
    action: "warn",
    severity: "info",
    message: global
      ? `Windsurf global rules file is long (${rule.charCount} characters > ${limit})`
      : `Windsurf workspace rule is long (${rule.charCount} characters > ${limit})`,
    reason: global
      ? "Windsurf limits ~/.codeium/windsurf/memories/global_rules.md to 6,000 characters. That is a vendor recommendation, not a load failure. See docs/spec/windsurf-rules.md."
      : "Windsurf limits workspace rule files to 12,000 characters each. That is a vendor recommendation, not a load failure. See docs/spec/windsurf-rules.md.",
    evidence: [
      { kind: "rule", value: rule.path },
      { kind: "count", value: `chars=${rule.charCount}` },
      { kind: "threshold", value: String(limit) },
    ],
    suggest: global
      ? "Shorten global_rules.md, or ignore this info finding if the length is deliberate"
      : "Split or shorten the rule file, or ignore this info finding if the length is deliberate",
  });
}

function missingTriggerFinding(rule: RuleFact): Finding | undefined {
  if (rule.sourceProvider !== "windsurf" || rule.windsurfScope !== "workspace") {
    return undefined;
  }
  if (rule.windsurfTriggerUnreadable === true) {
    return undefined;
  }
  if (rule.windsurfHasTrigger === true) {
    return undefined;
  }
  return make("windsurf.rule.missing-trigger", `rule:${rule.path}`, {
    action: "warn",
    severity: "warning",
    message: "Windsurf workspace rule is missing a frontmatter trigger",
    reason:
      "Each workspace rule declares an activation mode in its frontmatter via the `trigger` field (`always_on`, `glob`, `model_decision`, or `manual`). See docs/spec/windsurf-rules.md.",
    evidence: [{ kind: "rule", value: rule.path }],
    suggest: "Add a `trigger` field to the YAML frontmatter",
  });
}
