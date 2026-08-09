import { basename } from "node:path";
import type { AgentscanConfig } from "../config/schema";
import { defaultThresholds } from "../config/schema";
import { coerceVersion, gte, lt } from "../facts/semver";
import type { Facts, Finding, SkillFact } from "../facts/types";
import { skillMatchesPattern } from "./glob";
import type { RuleDefinition } from "./schema";

type Evidence = Finding["evidence"][number];

type MatchContext = {
  matchedSkill?: SkillFact;
  evidence: Evidence[];
  /** For budget templates {{count}} / {{threshold}} */
  count?: number;
  threshold?: number;
};

type ClauseResult =
  | { ok: false }
  | {
      ok: true;
      /** Skills bound by a positive skillMatches clause (if any) */
      matchedSkills?: SkillFact[];
      evidence: Evidence[];
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function allDeps(facts: Facts): Record<string, string> {
  return { ...facts.dependencies, ...facts.devDependencies };
}

function depRange(facts: Facts, name: string): string | undefined {
  return allDeps(facts)[name];
}

function skillsMatching(
  facts: Facts,
  patterns: string[],
): SkillFact[] {
  return facts.skills.filter((s) =>
    patterns.some((p) => skillMatchesPattern(s.id, p)),
  );
}

function parsePatterns(value: unknown): string[] | null {
  if (typeof value === "string") {
    return [value];
  }
  if (
    Array.isArray(value) &&
    value.every((v): v is string => typeof v === "string")
  ) {
    return value;
  }
  return null;
}

function evalDepClause(
  facts: Facts,
  clause: Record<string, unknown>,
): ClauseResult {
  const name = clause.dep;
  if (typeof name !== "string") {
    return { ok: false };
  }
  const range = depRange(facts, name);
  if (range === undefined) {
    return { ok: false };
  }

  const evidence: Evidence[] = [
    { kind: "dep", value: `${name}@${range}` },
  ];

  if (typeof clause.gte === "string") {
    const coerced = coerceVersion(range);
    if (coerced === null || !gte(coerced, clause.gte)) {
      return { ok: false };
    }
  }
  if (typeof clause.lt === "string") {
    const coerced = coerceVersion(range);
    if (coerced === null || !lt(coerced, clause.lt)) {
      return { ok: false };
    }
  }

  return { ok: true, evidence };
}

function evalSkillMatchesClause(
  facts: Facts,
  patterns: string[],
  negated: boolean,
): ClauseResult {
  const matched = skillsMatching(facts, patterns);
  if (negated) {
    return matched.length === 0
      ? { ok: true, evidence: [] }
      : { ok: false };
  }
  if (matched.length === 0) {
    return { ok: false };
  }
  return {
    ok: true,
    matchedSkills: matched,
    evidence: matched.map((s) => ({ kind: "skill", value: s.path })),
  };
}

function evalHasConfigClause(
  facts: Facts,
  key: string,
): ClauseResult {
  const configs = facts.configs as Record<string, unknown>;
  const value = configs[key];
  if (value === undefined || value === false || value === null) {
    return { ok: false };
  }
  return {
    ok: true,
    evidence: [{ kind: "config", value: key }],
  };
}

function evalPolicyMatchesClause(
  facts: Facts,
  needle: string,
): ClauseResult {
  const hits = facts.policyFiles.filter((p) => p.text.includes(needle));
  if (hits.length === 0) {
    return { ok: false };
  }
  return {
    ok: true,
    evidence: hits.map((p) => ({ kind: "policy", value: p.path })),
  };
}

function evalPackageManagerClause(
  facts: Facts,
  expected: string,
): ClauseResult {
  if (facts.packageManager !== expected) {
    return { ok: false };
  }
  return {
    ok: true,
    evidence: [{ kind: "packageManager", value: facts.packageManager }],
  };
}

function evalClause(facts: Facts, clause: unknown): ClauseResult {
  if (!isRecord(clause)) {
    return { ok: false };
  }

  if ("not" in clause) {
    const inner = evalClause(facts, clause.not);
    return inner.ok ? { ok: false } : { ok: true, evidence: [] };
  }

  if ("skillMatches" in clause) {
    const patterns = parsePatterns(clause.skillMatches);
    if (patterns === null) {
      return { ok: false };
    }
    return evalSkillMatchesClause(facts, patterns, false);
  }

  if ("dep" in clause) {
    return evalDepClause(facts, clause);
  }

  if ("hasConfig" in clause && typeof clause.hasConfig === "string") {
    return evalHasConfigClause(facts, clause.hasConfig);
  }

  if ("policyMatches" in clause && typeof clause.policyMatches === "string") {
    return evalPolicyMatchesClause(facts, clause.policyMatches);
  }

  if (
    "packageManager" in clause &&
    typeof clause.packageManager === "string"
  ) {
    return evalPackageManagerClause(facts, clause.packageManager);
  }

  if ("count" in clause && isRecord(clause.count)) {
    return evalCountClause(facts, clause.count);
  }

  if ("policyLines" in clause && isRecord(clause.policyLines)) {
    return evalPolicyLinesClause(facts, clause.policyLines);
  }

  // Unknown / empty clause: treat as non-matching for safety
  return { ok: false };
}

type CountOf = "skills" | "mcp" | "agents" | "hooks";

function collectionSize(facts: Facts, of: CountOf): number {
  switch (of) {
    case "skills":
      return facts.skills.length;
    case "mcp":
      return facts.mcp.length;
    case "agents":
      return facts.agents.length;
    case "hooks":
      return facts.hooks.length;
  }
}

/**
 * `{ count: { of: skills|mcp|agents|hooks, gt: N } }`
 * `gt` is absolute here. A rule that wants users to retune it via
 * `.agentscanrc.json` opts in with `thresholdKey` — see applyThresholdOverrides.
 */
function evalCountClause(
  facts: Facts,
  count: Record<string, unknown>,
): ClauseResult {
  const of = count.of;
  if (
    of !== "skills" &&
    of !== "mcp" &&
    of !== "agents" &&
    of !== "hooks"
  ) {
    return { ok: false };
  }
  const gtRaw = count.gt;
  if (typeof gtRaw !== "number" || !Number.isFinite(gtRaw)) {
    return { ok: false };
  }
  const threshold = gtRaw;
  const n = collectionSize(facts, of);
  if (!(n > threshold)) {
    return { ok: false };
  }
  return {
    ok: true,
    evidence: [
      { kind: "count", value: `${of}=${n}` },
      { kind: "threshold", value: String(threshold) },
    ],
  };
}

/**
 * `{ policyLines: { file: "AGENTS.md", gt: 150 } }`
 * Matches policyFiles entry by basename.
 */
function evalPolicyLinesClause(
  facts: Facts,
  pl: Record<string, unknown>,
): ClauseResult {
  const file = pl.file;
  const gtRaw = pl.gt;
  if (typeof file !== "string" || typeof gtRaw !== "number") {
    return { ok: false };
  }
  const threshold = gtRaw;
  for (const policy of facts.policyFiles) {
    if (basename(policy.path) !== file) {
      continue;
    }
    const lines = policy.text.length === 0 ? 0 : policy.text.split(/\r?\n/).length;
    if (lines > threshold) {
      return {
        ok: true,
        evidence: [
          { kind: "policy", value: policy.path },
          { kind: "count", value: `lines=${lines}` },
          { kind: "threshold", value: String(threshold) },
        ],
      };
    }
  }
  return { ok: false };
}

function evalAll(
  facts: Facts,
  clauses: unknown[],
): ClauseResult {
  const evidence: Evidence[] = [];
  let matchedSkills: SkillFact[] | undefined;

  for (const clause of clauses) {
    const result = evalClause(facts, clause);
    if (!result.ok) {
      return { ok: false };
    }
    evidence.push(...result.evidence);
    if (result.matchedSkills) {
      // Union of positive skillMatches across clauses
      const prev = matchedSkills ?? [];
      const seen = new Set(prev.map((s) => s.id));
      matchedSkills = [...prev];
      for (const s of result.matchedSkills) {
        if (!seen.has(s.id)) {
          seen.add(s.id);
          matchedSkills.push(s);
        }
      }
    }
  }

  return { ok: true, matchedSkills, evidence };
}

function applyTemplate(
  template: string,
  ctx: MatchContext,
): string {
  return template
    .replaceAll("{{matchedSkill}}", ctx.matchedSkill?.id ?? "")
    .replaceAll("{{matchedSkillPath}}", ctx.matchedSkill?.path ?? "")
    .replaceAll("{{count}}", ctx.count !== undefined ? String(ctx.count) : "")
    .replaceAll(
      "{{threshold}}",
      ctx.threshold !== undefined ? String(ctx.threshold) : "",
    );
}

/** Pull count/threshold from evidence for budget templates. */
function enrichCtxFromEvidence(ctx: MatchContext): MatchContext {
  let count = ctx.count;
  let threshold = ctx.threshold;
  for (const e of ctx.evidence) {
    if (e.kind === "count") {
      const m = /(?:=)(\d+)$/.exec(e.value) ?? /^(\d+)$/.exec(e.value);
      if (m?.[1]) {
        count = Number.parseInt(m[1], 10);
      }
    }
    if (e.kind === "threshold") {
      const n = Number.parseInt(e.value, 10);
      if (Number.isFinite(n)) {
        threshold = n;
      }
    }
  }
  return { ...ctx, count, threshold };
}

function skillIdFromSubject(subject: string, ctx: MatchContext): string | null {
  if (ctx.matchedSkill) {
    return ctx.matchedSkill.id;
  }
  if (subject.startsWith("skill:")) {
    return subject.slice("skill:".length);
  }
  return null;
}

function buildFinding(
  rule: RuleDefinition,
  ctx: MatchContext,
): Finding {
  const then = rule.then;
  const full = enrichCtxFromEvidence(ctx);
  const subject = applyTemplate(then.subject ?? `rule:${rule.id}`, full);
  const message = applyTemplate(then.message, full);
  const reason = applyTemplate(then.reason ?? then.message, full);
  const suggest =
    then.suggest !== undefined ? applyTemplate(then.suggest, full) : undefined;

  const evidence = [...ctx.evidence];
  if (
    ctx.matchedSkill &&
    !evidence.some(
      (e) => e.kind === "skill" && e.value === ctx.matchedSkill?.path,
    )
  ) {
    evidence.push({ kind: "skill", value: ctx.matchedSkill.path });
  }

  return {
    id: `${rule.id}:${subject}`,
    ruleId: rule.id,
    action: then.action,
    severity: then.severity ?? "warning",
    subject,
    message,
    reason,
    evidence,
    suggest,
  };
}

function shouldIgnoreFinding(
  finding: Finding,
  ctx: MatchContext,
  ignoreSkills: Set<string>,
): boolean {
  if (ignoreSkills.size === 0) {
    return false;
  }
  const skillId = skillIdFromSubject(finding.subject, ctx);
  if (skillId !== null && ignoreSkills.has(skillId)) {
    return true;
  }
  return false;
}

/** Named config threshold, or undefined when the rule did not opt in. */
function lookupThreshold(
  key: unknown,
  thresholds: AgentscanConfig["thresholds"],
): number | undefined {
  if (typeof key !== "string") {
    return undefined;
  }
  const value = (thresholds as Record<string, unknown>)[key];
  return typeof value === "number" ? value : undefined;
}

/**
 * Let `.agentscanrc.json` retune a rule's `gt` — but only for rules that opt in
 * with `thresholdKey`. Keying this on the clause shape instead would silently
 * rewrite every user rule that happens to count skills/mcp/agents.
 */
function applyThresholdOverrides(
  when: unknown,
  config: AgentscanConfig,
): unknown {
  if (!isRecord(when)) {
    return when;
  }
  const t = config.thresholds ?? defaultThresholds;
  let out: Record<string, unknown> = when;

  if (isRecord(out.count)) {
    const gt = lookupThreshold(out.count.thresholdKey, t);
    if (gt !== undefined) {
      out = { ...out, count: { ...out.count, gt } };
    }
  }
  if (isRecord(out.policyLines)) {
    const gt = lookupThreshold(out.policyLines.thresholdKey, t);
    if (gt !== undefined) {
      out = { ...out, policyLines: { ...out.policyLines, gt } };
    }
  }
  if (Array.isArray(out.all)) {
    out = {
      ...out,
      all: out.all.map((c) => applyThresholdOverrides(c, config)),
    };
  }
  if ("not" in out) {
    out = { ...out, not: applyThresholdOverrides(out.not, config) };
  }
  return out;
}

function evaluateRule(
  facts: Facts,
  rule: RuleDefinition,
  config: AgentscanConfig,
): Array<{ finding: Finding; ctx: MatchContext }> {
  const when = applyThresholdOverrides(rule.when, config);

  // when.all
  if (isRecord(when) && Array.isArray(when.all)) {
    const result = evalAll(facts, when.all);
    if (!result.ok) {
      return [];
    }
    const baseEvidence = result.evidence;
    if (result.matchedSkills && result.matchedSkills.length > 0) {
      return result.matchedSkills.map((s) => {
        const ctx: MatchContext = {
          matchedSkill: s,
          evidence: [
            ...baseEvidence.filter((e) => e.kind !== "skill"),
            { kind: "skill", value: s.path },
          ],
        };
        return { finding: buildFinding(rule, ctx), ctx };
      });
    }
    const ctx: MatchContext = { evidence: baseEvidence };
    return [{ finding: buildFinding(rule, ctx), ctx }];
  }

  // Empty when → always match once
  if (isRecord(when) && Object.keys(when).length === 0) {
    const ctx: MatchContext = { evidence: [] };
    return [{ finding: buildFinding(rule, ctx), ctx }];
  }

  // Single clause as when body
  if (isRecord(when)) {
    // if when is a single known clause shape
    if (
      "dep" in when ||
      "skillMatches" in when ||
      "hasConfig" in when ||
      "policyMatches" in when ||
      "packageManager" in when ||
      "not" in when ||
      "count" in when ||
      "policyLines" in when
    ) {
      const result = evalClause(facts, when);
      if (!result.ok) {
        return [];
      }
      if (result.matchedSkills && result.matchedSkills.length > 0) {
        return result.matchedSkills.map((s) => {
          const ctx: MatchContext = {
            matchedSkill: s,
            evidence: [
              ...result.evidence.filter((e) => e.kind !== "skill"),
              { kind: "skill", value: s.path },
            ],
          };
          return { finding: buildFinding(rule, ctx), ctx };
        });
      }
      const ctx: MatchContext = { evidence: result.evidence };
      return [{ finding: buildFinding(rule, ctx), ctx }];
    }
  }

  return [];
}

/**
 * Evaluate declarative rules against immutable facts → findings.
 * Respects config.ignoreRules and config.ignoreSkills.
 * Finding ids: `${ruleId}:${subject}` (after template expansion).
 */
export function runRules(
  facts: Facts,
  rules: RuleDefinition[],
  config: AgentscanConfig,
): Finding[] {
  const ignoreRules = new Set(config.ignoreRules);
  const ignoreSkills = new Set(config.ignoreSkills);
  const findings: Finding[] = [];

  for (const rule of rules) {
    if (ignoreRules.has(rule.id)) {
      continue;
    }
    const produced = evaluateRule(facts, rule, config);
    for (const { finding, ctx } of produced) {
      if (shouldIgnoreFinding(finding, ctx, ignoreSkills)) {
        continue;
      }
      findings.push(finding);
    }
  }

  return findings;
}
