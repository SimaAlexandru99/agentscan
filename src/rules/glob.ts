/**
 * Simple glob for skill ids: exact, prefix (`foo*`), or suffix (`*foo`).
 * Single `*` matches any id. No multi-segment or middle globs.
 */
export function skillMatchesPattern(skillId: string, pattern: string): boolean {
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
    return false;
  }
  return skillId === pattern;
}
