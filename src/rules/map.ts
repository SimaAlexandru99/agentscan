export type DepSkillMapEntry = {
  dep: string;
  skillPatterns: string[];
};

/**
 * Seed dep → skill id patterns (design spec §8.1).
 * Data only — evaluation lives in the rules engine.
 */
export const DEP_SKILL_MAP: DepSkillMapEntry[] = [
  { dep: "next", skillPatterns: ["next-*"] },
  {
    dep: "better-auth",
    skillPatterns: ["better-auth*"],
  },
  { dep: "@tanstack/react-query", skillPatterns: ["tanstack-query*"] },
  { dep: "shadcn", skillPatterns: ["shadcn*"] },
  { dep: "@prisma/client", skillPatterns: ["prisma*"] },
  { dep: "prisma", skillPatterns: ["prisma*"] },
  { dep: "zod", skillPatterns: ["zod*"] },
];

/**
 * Simple glob: exact, prefix (`foo*`), or suffix (`*foo`).
 * Single `*` matches any skill id. No multi-segment / middle globs.
 */
export function skillMatchesPattern(
  skillId: string,
  pattern: string,
): boolean {
  if (pattern === "*") {
    return true;
  }
  if (pattern.endsWith("*") && !pattern.startsWith("*")) {
    return skillId.startsWith(pattern.slice(0, -1));
  }
  if (pattern.startsWith("*") && !pattern.endsWith("*")) {
    return skillId.endsWith(pattern.slice(1));
  }
  if (pattern.startsWith("*") && pattern.endsWith("*") && pattern.length > 1) {
    // reject middle globs in v1 (not part of seed map)
    return false;
  }
  return skillId === pattern;
}
