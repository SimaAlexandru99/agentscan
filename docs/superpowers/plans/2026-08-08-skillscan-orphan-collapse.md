# skillscan orphan collapse Implementation Plan

> **COMPLETED / historical.** Shipped across commits `cc3fbc2`…`310b131`; the
> `- [ ]` checkboxes below were never ticked during execution. Current behavior
> lives in `README.md`, not here.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Default human text report collapses `skill.orphan` findings into one `ORPHAN` line with count + top 3 skill families; JSON and `--verbose` stay fully expanded.

**Architecture:** Report-layer only. Pure helpers in `orphan-summary.ts`; `renderText` partitions orphans vs rest, emits summary line, excludes orphans from `info hidden` when collapsed. Engine/JSON untouched.

**Tech Stack:** TypeScript strict, Bun test, existing `Finding` type. Spec: `docs/superpowers/specs/2026-08-08-skillscan-orphan-collapse-design.md`.

## Global Constraints

- TypeScript strict, no `any`
- bun only (`bun test`, `bun run typecheck`)
- Report-only: no `apply`, no engine/YAML rule changes
- JSON output shape unchanged
- `ruleId === "skill.orphan"` is the only collapsed set
- Family = prefix before first `-` after stripping `skill:`
- Top 3 families by count desc, name asc
- ORPHAN line format exact:
  `ORPHAN  {n} skills · top: {fam} ({c}), ... · --verbose for list`
  (or without `top:` segment if zero families — should not happen when n≥1)
- Quiet mode: no ORPHAN body line (summary only)
- When ORPHAN line shown (default non-verbose non-quiet): do not count those orphans toward `info hidden`

## File map

| Path | Role |
|------|------|
| Create `src/report/orphan-summary.ts` | `skillFamily`, `buildOrphanSummary` |
| Modify `src/report/text.ts` | partition, wire summary, info-hidden exclusion |
| Create `tests/unit/orphan-summary.test.ts` | pure helper tests |
| Modify `tests/unit/report.test.ts` | renderText collapse / verbose / mix |
| Modify `tests/integration/check.test.ts` | fixture default + verbose |

---

### Task 1: Pure orphan summary helpers

**Files:**
- Create: `src/report/orphan-summary.ts`
- Create: `tests/unit/orphan-summary.test.ts`

**Interfaces:**
- Produces:
  - `export function skillFamily(subjectOrId: string): string`
  - `export function buildOrphanSummary(findings: Finding[]): string | null`
- Consumes: `Finding` from `../facts/types`

- [ ] **Step 1: Write failing tests**

```ts
// tests/unit/orphan-summary.test.ts
import { describe, expect, test } from "bun:test";
import type { Finding } from "../../src/facts/types";
import {
  buildOrphanSummary,
  skillFamily,
} from "../../src/report/orphan-summary";

function orphan(subject: string, id = subject): Finding {
  return {
    id: `skill.orphan:${id}`,
    ruleId: "skill.orphan",
    action: "warn",
    severity: "info",
    subject,
    message: "Orphan skill",
    reason: "test",
    evidence: [],
  };
}

describe("skillFamily", () => {
  test("strips skill: and takes prefix before first hyphen", () => {
    expect(skillFamily("skill:firebase-auth-basics")).toBe("firebase");
    expect(skillFamily("tanstack-query")).toBe("tanstack");
    expect(skillFamily("zod")).toBe("zod");
  });
});

describe("buildOrphanSummary", () => {
  test("returns null when no orphans", () => {
    const other: Finding = {
      id: "x:skill:y",
      ruleId: "next.redundant-cache-components-skill",
      action: "delete",
      severity: "warning",
      subject: "skill:next-cache-components",
      message: "x",
      reason: "y",
      evidence: [],
    };
    expect(buildOrphanSummary([other])).toBeNull();
    expect(buildOrphanSummary([])).toBeNull();
  });

  test("one line with count and top families", () => {
    const findings = [
      orphan("skill:firebase-a"),
      orphan("skill:firebase-b"),
      orphan("skill:tanstack-x"),
      orphan("skill:design-taste"),
      orphan("skill:gsap-core"),
    ];
    const line = buildOrphanSummary(findings);
    expect(line).toBe(
      "ORPHAN  5 skills · top: firebase (2), design (1), gsap (1) · --verbose for list",
    );
    // top 3 only — tanstack and design/gsap tie at 1: name asc → design, gsap (tanstack dropped)
  });

  test("ignores non-orphan findings in input", () => {
    const findings = [
      orphan("skill:foo-bar"),
      {
        id: "a:b",
        ruleId: "other",
        action: "add" as const,
        severity: "warning" as const,
        subject: "skill:better-auth",
        message: "m",
        reason: "r",
        evidence: [],
      },
    ];
    expect(buildOrphanSummary(findings)).toBe(
      "ORPHAN  1 skills · top: foo (1) · --verbose for list",
    );
  });
});
```

**Note on tie-break:** families with count 1: `design`, `gsap`, `tanstack` — sort count desc then name asc → design, gsap, tanstack; top 3 = all three if only three singles + firebase wins. With firebase (2) + three singles, top 3 = firebase (2), design (1), gsap (1). Adjust expected string if sort puts tanstack before gsap — **name asc**: design, gsap, tanstack. Good.

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd ~/projects/skillscan && bun test tests/unit/orphan-summary.test.ts
```

- [ ] **Step 3: Implement `src/report/orphan-summary.ts`**

```ts
import type { Finding } from "../facts/types";

const ORPHAN_RULE = "skill.orphan";

export function skillFamily(subjectOrId: string): string {
  const id = subjectOrId.replace(/^skill:/, "");
  const i = id.indexOf("-");
  return i === -1 ? id : id.slice(0, i);
}

/**
 * One ORPHAN summary line, or null if no skill.orphan findings.
 * Filters ruleId === skill.orphan itself.
 */
export function buildOrphanSummary(findings: Finding[]): string | null {
  const orphans = findings.filter((f) => f.ruleId === ORPHAN_RULE);
  if (orphans.length === 0) {
    return null;
  }

  const counts = new Map<string, number>();
  for (const f of orphans) {
    const fam = skillFamily(f.subject);
    counts.set(fam, (counts.get(fam) ?? 0) + 1);
  }

  const ranked = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) {
      return b[1] - a[1];
    }
    return a[0].localeCompare(b[0]);
  });
  const top = ranked.slice(0, 3);

  const n = orphans.length;
  if (top.length === 0) {
    return `ORPHAN  ${n} skills · --verbose for list`;
  }
  const topPart = top.map(([name, c]) => `${name} (${c})`).join(", ");
  return `ORPHAN  ${n} skills · top: ${topPart} · --verbose for list`;
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
bun test tests/unit/orphan-summary.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/report/orphan-summary.ts tests/unit/orphan-summary.test.ts
git commit -m "feat: orphan summary helpers for text collapse"
```

---

### Task 2: Wire renderText collapse

**Files:**
- Modify: `src/report/text.ts`
- Modify: `tests/unit/report.test.ts`

**Interfaces:**
- Consumes: `buildOrphanSummary` from `./orphan-summary`
- `renderText` signature unchanged

**Logic (default non-verbose non-quiet):**

1. `sorted = sortFindings(findings)`
2. `orphans = sorted.filter(f => f.ruleId === "skill.orphan")`
3. `rest = sorted.filter(f => f.ruleId !== "skill.orphan")`
4. `visible = rest` filtered: hide keep + hide info (existing)
5. Body: format each visible finding
6. `orphanLine = buildOrphanSummary(sorted)` — if non-null, append blank line + orphanLine + blank line before summary (or just orphanLine + blank before summary)
7. `formatSummary(rest, verbose, { collapseOrphans: true })` — when computing info hidden, only info on `rest`; do not walk orphans

**Verbose:** no partition for body — all sorted visible including orphans (existing verbose path). `formatSummary` counts as today (no orphan exclusion). Do not emit ORPHAN line.

**Quiet:** only `formatSummary` on full findings with collapse rule: if non-verbose, exclude skill.orphan from infoHidden (orphans already "accounted" even without ORPHAN line — quiet has no ORPHAN line per spec). Spec: quiet does not print ORPHAN line; orphans should not inflate `info hidden` either (user would re-hide the collapse value). So quiet + default share: **info hidden excludes skill.orphan**.

Simplify info-hidden rule for all non-verbose paths:

```ts
// when !verbose:
//   if f.ruleId === "skill.orphan" → skip entirely for counts (not action counts either? 
//   orphans have action warn — should warn count exclude them in default?
```

Spec says: exclude orphans from **info hidden** when ORPHAN line shown. Orphans are severity info + action warn. Current code skips all info severity for action counts when !verbose, so orphans never hit `counts.warn` today — they only hit `infoHidden`. Good.

So only change: `infoHidden` loop:

```ts
if (!verbose && f.severity === "info") {
  if (f.ruleId === "skill.orphan") {
    continue; // collapsed separately or quiet: not in info hidden
  }
  infoHidden += 1;
  continue;
}
```

And body visible filter default:

```ts
const visible = verbose
  ? sorted
  : sorted.filter(
      (f) =>
        f.action !== "keep" &&
        f.severity !== "info" &&
        f.ruleId !== "skill.orphan", // belt + suspenders (orphan is info)
    );
```

Emit ORPHAN line only when `!verbose && !quiet`.

- [ ] **Step 1: Add/update unit tests in `tests/unit/report.test.ts`**

```ts
test("collapses orphans into one ORPHAN line by default", () => {
  const findings = [
    finding({
      id: "d:1",
      action: "delete",
      severity: "warning",
      subject: "skill:next-cache-components",
      ruleId: "next.redundant-cache-components-skill",
      message: "Redundant",
    }),
    finding({
      id: "skill.orphan:skill:firebase-a",
      action: "warn",
      severity: "info",
      subject: "skill:firebase-a",
      ruleId: "skill.orphan",
      message: "Orphan skill",
    }),
    finding({
      id: "skill.orphan:skill:firebase-b",
      action: "warn",
      severity: "info",
      subject: "skill:firebase-b",
      ruleId: "skill.orphan",
      message: "Orphan skill",
    }),
  ];
  const text = renderText({
    version: "0.1.0",
    facts: baseFacts(),
    findings,
    verbose: false,
    quiet: false,
  });
  expect(text).toContain("DELETE");
  expect(text).toContain("ORPHAN  2 skills");
  expect(text).toContain("firebase (2)");
  expect(text).not.toContain("skill:firebase-a");
  expect(text).not.toMatch(/info hidden/); // orphans excluded
});

test("verbose lists each orphan subject", () => {
  // same findings, verbose true → contains skill:firebase-a, no ORPHAN summary line required
  // prefer: expect(text).not.toMatch(/^ORPHAN /m) or not.toContain("ORPHAN  2 skills")
});
```

Update existing test `orphan hidden in default` patterns if they expect only `info hidden` without ORPHAN — those live in integration Task 3.

Update `hides info severity unless verbose` if it used orphan-like findings — keep non-orphan info still hidden + counted.

- [ ] **Step 2: Implement text.ts wiring; run `bun test tests/unit/report.test.ts` PASS**

- [ ] **Step 3: Commit**

```bash
git add src/report/text.ts tests/unit/report.test.ts
git commit -m "feat: collapse orphan findings in default text report"
```

---

### Task 3: Integration fixture + green suite

**Files:**
- Modify: `tests/integration/check.test.ts`

- [ ] **Step 1: Replace orphan text expectations**

```ts
test("orphan collapsed in default text report", async () => {
  const result = await runCheck({
    dir: join(fixturesRoot, "orphan-skill"),
    failOn: "never",
  });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("ORPHAN");
  expect(result.stdout).toMatch(/1 skills/);
  expect(result.stdout).not.toContain("totally-orphan-xyz");
  expect(result.stdout).not.toMatch(/info hidden/);
});

test("orphan listed when verbose", async () => {
  const result = await runCheck({
    dir: join(fixturesRoot, "orphan-skill"),
    failOn: "never",
    verbose: true,
  });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("totally-orphan-xyz");
  expect(result.stdout).not.toMatch(/ORPHAN  \d+ skills/);
});
```

Confirm `runCheck` / CheckOptions already support `verbose?: boolean` — if not, add pass-through in `src/commands/check.ts` only if missing (check file; Task 3 must wire if absent).

- [ ] **Step 2: Full suite**

```bash
bun test && bun run typecheck
```

Expected: all pass.

- [ ] **Step 3: Manual smoke**

```bash
bun run src/cli.ts check tests/fixtures/orphan-skill
bun run src/cli.ts check tests/fixtures/orphan-skill --verbose
# optional: bun run src/cli.ts check ~/projects/dialyx | head -40
```

- [ ] **Step 4: Commit**

```bash
git add tests/integration/check.test.ts src/commands/check.ts  # only if check.ts changed
git commit -m "test: integration for orphan text collapse"
```

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| skillFamily + buildOrphanSummary | 1 |
| ORPHAN line format / top 3 | 1 |
| renderText default collapse | 2 |
| verbose full list | 2–3 |
| info hidden excludes orphans | 2 |
| quiet no ORPHAN line | 2 (quiet path) |
| JSON unchanged | no task (untouched) |
| integration fixture | 3 |

## Placeholder scan

None.

## Type consistency

- `Finding.ruleId === "skill.orphan"` constant in orphan-summary.
- `renderText` args unchanged.

## Done definition

- `bun test` green  
- `bun run typecheck` green  
- Default orphan fixture shows `ORPHAN` without skill id  
- Verbose shows skill id  
- JSON still has per-skill orphan finding  
