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
