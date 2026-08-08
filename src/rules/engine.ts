import type { SkillscanConfig } from "../config/schema";
import { coerceVersion, gte, lt } from "../facts/semver";
import type { Facts, Finding, SkillFact } from "../facts/types";
import { DEP_SKILL_MAP, skillMatchesPattern } from "./map";
import type { RuleDefinition } from "./schema";

type Evidence = Finding["evidence"][number];

type MatchContext = {
  matchedSkill?: SkillFact;
  evidence: Evidence[];
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

  // Unknown / empty clause: treat as non-matching for safety
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

function installedDeps(facts: Facts): Set<string> {
  return new Set(Object.keys(allDeps(facts)));
}

/**
 * Skill is orphan when:
 * - id does not match any DEP_SKILL_MAP pattern for an installed dep
 * - and no policy text includes the skill id as substring
 */
export function isOrphanSkill(facts: Facts, skill: SkillFact): boolean {
  const deps = installedDeps(facts);
  for (const entry of DEP_SKILL_MAP) {
    if (!deps.has(entry.dep)) {
      continue;
    }
    for (const pattern of entry.skillPatterns) {
      if (skillMatchesPattern(skill.id, pattern)) {
        return false;
      }
    }
  }
  for (const policy of facts.policyFiles) {
    if (policy.text.includes(skill.id)) {
      return false;
    }
  }
  return true;
}

function applyTemplate(
  template: string,
  ctx: MatchContext,
): string {
  return template
    .replaceAll("{{matchedSkill}}", ctx.matchedSkill?.id ?? "")
    .replaceAll("{{matchedSkillPath}}", ctx.matchedSkill?.path ?? "");
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
  const subject = applyTemplate(then.subject ?? `rule:${rule.id}`, ctx);
  const message = applyTemplate(then.message, ctx);
  const reason = applyTemplate(then.reason ?? then.message, ctx);
  const suggest =
    then.suggest !== undefined ? applyTemplate(then.suggest, ctx) : undefined;

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

function evaluateRule(
  facts: Facts,
  rule: RuleDefinition,
): Array<{ finding: Finding; ctx: MatchContext }> {
  const when = rule.when;

  // Top-level perSkill orphan
  if (isRecord(when) && isRecord(when.perSkill) && when.perSkill.orphan === true) {
    const out: Array<{ finding: Finding; ctx: MatchContext }> = [];
    for (const s of facts.skills) {
      if (!isOrphanSkill(facts, s)) {
        continue;
      }
      const ctx: MatchContext = {
        matchedSkill: s,
        evidence: [{ kind: "skill", value: s.path }],
      };
      out.push({ finding: buildFinding(rule, ctx), ctx });
    }
    return out;
  }

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
      "not" in when
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
  config: SkillscanConfig,
): Finding[] {
  const ignoreRules = new Set(config.ignoreRules);
  const ignoreSkills = new Set(config.ignoreSkills);
  const findings: Finding[] = [];

  for (const rule of rules) {
    if (ignoreRules.has(rule.id)) {
      continue;
    }
    const produced = evaluateRule(facts, rule);
    for (const { finding, ctx } of produced) {
      if (shouldIgnoreFinding(finding, ctx, ignoreSkills)) {
        continue;
      }
      findings.push(finding);
    }
  }

  return findings;
}
