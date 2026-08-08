# skillscan — Orphan collapse (text report)

> **SUPERSEDED — historical design document.**
> Behavior drifted during implementation; `README.md` is the source of truth.
> Known divergences: Bun-only runtime (no Node), orphans are a facts-derived
> observation (`orphanSkills`) rather than a DELETE finding, budget rules and the
> `count` / `policyLines` / `packageManager` clauses were added by later council
> decision (`.orch/bloat-thresholds/council/03_decision.md`), `policyMatches` is a
> substring not a regex, and `hasMcp` / `hasHook` / `any` were never built.

**Date:** 2026-08-08  
**Status:** Approved (brainstorming)  
**Repo:** `~/projects/skillscan`  
**Parent:** `2026-08-08-skillscan-design.md` (v1 report-only CLI)

## 1. Problem

Fleet scans emit dozens of `skill.orphan` findings (info). Default text either hides them as opaque `N info hidden (--verbose)` or, if listed, floods the report. Users need a **single actionable summary** without losing per-skill data for agents/JSON.

## 2. Goal

Collapse orphan findings in **human text (default)** into one `ORPHAN` line with total count and top skill families. Keep JSON and `--verbose` behavior fully expanded.

## 3. Non-goals

- Changing the rules engine or `skill.orphan` YAML severity/action
- Changing `--json` shape (no synthetic summary finding required)
- Budget rules (skills>30, mcp>5, …)
- DEP_SKILL_MAP expansion
- Fleet multi-repo CLI mode
- `apply` / delete skills

## 4. Decisions locked

| Decision | Choice |
|----------|--------|
| Approach | **Report-layer collapse** only (`renderText`) |
| Default text | **One summary line** (option A) |
| JSON | **Full** per-skill findings unchanged |
| Verbose | Full per-orphan listing (existing format) |
| Family heuristic | Prefix before first `-` on skill id |
| Top families shown | **3** (by count desc, name asc) |
| Summary `info hidden` | **Exclude** `skill.orphan` when ORPHAN line is shown (option B) |

## 5. Behavior matrix

| Mode | Orphan presentation |
|------|---------------------|
| `check` text default | One `ORPHAN` line if count ≥ 1; no per-skill orphan body lines |
| `check --verbose` | Each orphan finding formatted like today; no collapse |
| `check --quiet` | Summary line only; orphan count reflected via remaining rules (no ORPHAN body). Prefer counting non-orphan info in `info hidden` only; orphans may appear only as part of counts if needed — **quiet does not print ORPHAN line** (summary stays one line). Orphan totals remain available via JSON. |
| `check --json` | Unchanged array of findings including every `skill.orphan` |

Non-orphan findings (DELETE, ADD, DRIFT, WARN non-orphan, etc.) render as today.

## 6. Family heuristic

```ts
function skillFamily(subjectOrId: string): string {
  const id = subjectOrId.replace(/^skill:/, "");
  const i = id.indexOf("-");
  return i === -1 ? id : id.slice(0, i);
}
```

- Input: finding `subject` (e.g. `skill:firebase-auth-basics`) or skill id.
- Top families: group orphans by family, sort by `(count desc, family name asc)`, take first 3.
- Display fragment: `firebase (12), tanstack (8), design (5)`.

## 7. ORPHAN line format (stable)

```text
ORPHAN  41 skills · top: firebase (12), tanstack (8), design (5) · --verbose for list
```

Rules:

- If orphan count is 0: emit **no** ORPHAN line.
- If fewer than 3 families: list only those present.
- If families cannot be derived (should not happen): `ORPHAN  N skills · --verbose for list`.
- Placement: after all non-orphan body findings, **before** the final `Summary:` line.
- Action column style: use `ORPHAN` as label (7-char pad not required if it reads clearly; keep visual weight similar to `DELETE`/`ADD`).

## 8. Interaction with `info hidden`

Today default text hides `severity === "info"` and may print `N info hidden (--verbose)`.

After this change:

1. Partition findings into `orphans` (`ruleId === "skill.orphan"`) and `rest`.
2. For default (non-verbose) body: render `rest` with existing filters (hide keep, hide info on rest).
3. If `orphans.length > 0`, append ORPHAN summary line.
4. When computing `info hidden` count for the Summary line: count info findings in `rest` only **plus** do **not** count orphans toward `info hidden` if the ORPHAN line was emitted (default path). On `--verbose`, no collapse and no special exclusion (list everything; summary may count all actions including warn orphans).

This avoids double messaging: `ORPHAN 41 …` and `41 info hidden` together.

## 9. Architecture / files

```text
findings
   │
   ├─► renderJson  ─────────────────────────► full findings (unchanged)
   │
   └─► renderText
         ├─ partition: orphans vs rest
         ├─ format rest (existing)
         ├─ buildOrphanSummary(orphans) → string | null
         └─ formatSummary(rest + rules for info-hidden exclusion)
```

| Path | Responsibility |
|------|----------------|
| `src/report/orphan-summary.ts` | `skillFamily`, `buildOrphanSummary(findings): string \| null` pure helpers |
| `src/report/text.ts` | Wire partition + placement + info-hidden exclusion |
| `tests/unit/orphan-summary.test.ts` | Family + top-3 + empty |
| `tests/unit/report.test.ts` | Collapse in renderText; verbose lists; mix with DELETE |
| `tests/integration/check.test.ts` | Fixture `orphan-skill`: default text has ORPHAN, no skill id; verbose has id |

## 10. Interfaces

```ts
/** Pure: ORPHAN line or null if no skill.orphan findings. */
export function buildOrphanSummary(findings: Finding[]): string | null

export function skillFamily(subjectOrId: string): string
```

`buildOrphanSummary` filters `ruleId === "skill.orphan"` itself so callers can pass full findings.

## 11. Testing / acceptance

1. Three orphans `skill:firebase-a`, `skill:firebase-b`, `skill:tanstack-x` → one line, `firebase (2), tanstack (1)`, body has no those subjects.
2. `--verbose` (unit via `renderText({ verbose: true })`) includes subjects.
3. Zero orphans → no `ORPHAN` substring.
4. DELETE + orphans → DELETE block present + ORPHAN line + Summary without double-counting orphans as info hidden.
5. Integration: `orphan-skill` fixture default stdout matches collapse; verbose still shows `totally-orphan-xyz`.

## 12. Risks

| Risk | Mitigation |
|------|------------|
| Weak family split (`next-cache` → `next`) | Accept for v1; later optional family map |
| Future non-orphan info rules | Only `skill.orphan` collapsed; other info still use info-hidden |
| Quiet mode ambiguity | Quiet stays one Summary line; full orphan list via JSON |

## 13. Success criteria

- Default `check` on a 40-orphan repo is readable in one glance.
- JSON consumers and `explain <orphan-id>` remain valid.
- Existing non-orphan report tests stay green.

## 14. Approval

- Wedge: orphan collapse (improve #1 from bloat-thresholds council).
- Approaches: report-layer (1) approved; JSON full + text collapse approved.
- Design sections §1–7 approved 2026-08-08 by product owner.
