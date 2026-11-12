import type { Provider } from "../facts/provider";
import type { AntigravityRuleDefect, Facts, RuleFact } from "../facts/types";
import type { Finding } from "../findings";
import { make } from "./make";

const CURSOR_RULE_LINE_LIMIT = 500;
const WINDSURF_WORKSPACE_CHAR_LIMIT = 12_000;
const WINDSURF_GLOBAL_CHAR_LIMIT = 6_000;
const ANTIGRAVITY_RULE_BYTE_LIMIT = 24_000;

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
    out.push(...antigravityRuleFindings(rule));
  }
  return out;
}

/** Providers with a quoted size budget; every other provider has none. */
const TOO_LARGE: Partial<Record<Provider, (rule: RuleFact) => Finding | undefined>> = {
  cursor: cursorTooLargeFinding,
  windsurf: windsurfTooLargeFinding,
};

function tooLargeFinding(rule: RuleFact): Finding | undefined {
  return TOO_LARGE[rule.sourceProvider]?.(rule);
}

function cursorTooLargeFinding(rule: RuleFact): Finding | undefined {
  const limit = CURSOR_RULE_LINE_LIMIT;
  if (rule.lineCount <= limit) {
    return undefined;
  }
  return make("cursor.rule.too-large", `rule:${rule.path}`, {
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
  if (rule.windsurfTrigger === "yes" || rule.windsurfTrigger === "unreadable") {
    return undefined;
  }
  return make("windsurf.rule.missing-trigger", `rule:${rule.path}`, {
    message: "Windsurf workspace rule is missing a frontmatter trigger",
    reason:
      "Each workspace rule declares an activation mode in its frontmatter via the `trigger` field (`always_on`, `glob`, `model_decision`, or `manual`). See docs/spec/windsurf-rules.md.",
    evidence: [{ kind: "rule", value: rule.path }],
    suggest: "Add a `trigger` field to the YAML frontmatter",
  });
}

type AntigravityDefectCopy = {
  id:
    | "antigravity.rule.missing-trigger"
    | "antigravity.rule.invalid-trigger"
    | "antigravity.rule.missing-description"
    | "antigravity.rule.missing-globs";
  message: string;
  reason: string;
  suggest: string;
};

const ANTIGRAVITY_DEFECTS: Record<AntigravityRuleDefect, AntigravityDefectCopy> = {
  "missing-trigger": {
    id: "antigravity.rule.missing-trigger",
    message: "Antigravity rule is missing a frontmatter trigger",
    reason:
      "Every Markdown file in an Antigravity rules directory must start with YAML frontmatter that sets `trigger`. `AGENTS.md` and `GEMINI.md` do not. See docs/spec/antigravity-rules.md.",
    suggest: "Add a `trigger` field to the YAML frontmatter",
  },
  "invalid-trigger": {
    id: "antigravity.rule.invalid-trigger",
    message: "Antigravity rule trigger is not always_on, model_decision, glob, or manual",
    reason:
      "Antigravity accepts only those four `trigger` values. See docs/spec/antigravity-rules.md.",
    suggest: "Set `trigger` to always_on, model_decision, glob, or manual",
  },
  "missing-description": {
    id: "antigravity.rule.missing-description",
    message: "Antigravity model_decision rule is missing a description",
    reason:
      "A `model_decision` rule needs a non-empty `description` string. Other triggers do not. See docs/spec/antigravity-rules.md.",
    suggest: "Add a `description` string to the frontmatter",
  },
  "missing-globs": {
    id: "antigravity.rule.missing-globs",
    message: "Antigravity glob rule is missing globs",
    reason:
      "A `glob` rule needs a non-empty `globs` or `glob` string. See docs/spec/antigravity-rules.md.",
    suggest: "Add a `globs` or `glob` string to the frontmatter",
  },
};

function antigravityRuleFindings(rule: RuleFact): Finding[] {
  if (rule.sourceProvider !== "antigravity") {
    return [];
  }
  const out: Finding[] = [];
  const defect = rule.antigravityDefect;
  if (defect !== undefined) {
    const spec = ANTIGRAVITY_DEFECTS[defect];
    out.push(
      make(spec.id, `rule:${rule.path}`, {
        message: spec.message,
        reason: spec.reason,
        evidence: [{ kind: "rule", value: rule.path }],
        suggest: spec.suggest,
      }),
    );
  }
  if (rule.byteLength > ANTIGRAVITY_RULE_BYTE_LIMIT) {
    out.push(
      make("antigravity.rule.too-large", `rule:${rule.path}`, {
        message: `Antigravity rule exceeds 24,000 bytes (${rule.byteLength} bytes)`,
        reason:
          "Antigravity truncates any single rule file that exceeds 24,000 bytes. This check uses the raw file, before `@[label](path)` expansion, so a smaller file can still be truncated after includes. See docs/spec/antigravity-rules.md.",
        evidence: [
          { kind: "rule", value: rule.path },
          { kind: "count", value: `bytes=${rule.byteLength}` },
          { kind: "threshold", value: String(ANTIGRAVITY_RULE_BYTE_LIMIT) },
        ],
        suggest: "Shorten the rule file. Antigravity truncates a file past 24,000 bytes",
      }),
    );
  }
  return out;
}
