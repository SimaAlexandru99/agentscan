import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ConfigErrorFact, LockedSkillFact } from "../facts/types";
import { readCapped, readJsonConfig, POLICY_CAP } from "./shared";

export function discoverPolicyFiles(
  root: string,
  policyFiles: string[],
  errors: ConfigErrorFact[],
): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  for (const rel of policyFiles) {
    const filePath = join(root, rel);
    if (!existsSync(filePath)) {
      continue;
    }
    try {
      const result = readCapped(filePath, POLICY_CAP);
      const text = result.buf.subarray(0, POLICY_CAP).toString("utf8");
      out.push({ path: filePath, text });
      // A policy file past the cap is still a valid policy file; only the line
      // count below it undercounts. Says so at info rather than calling the
      // file unreadable at error.
      if (result.truncated) errors.push({ path: filePath, kind: "truncated", detail: `file exceeds ${POLICY_CAP} byte scan cap` });
    } catch (err) {
      errors.push({
        path: filePath,
        kind: "unreadable",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return out;
}
/**
 * skills-lock.json — the oracle for which skills are managed installs pinned to
 * an upstream source, and which are local and unpinned.
 */
export function discoverSkillsLock(
  root: string,
  errors: ConfigErrorFact[],
): { locked: LockedSkillFact[]; present: boolean; invalid?: boolean } {
  const filePath = join(root, "skills-lock.json");
  if (!existsSync(filePath)) {
    return { locked: [], present: false };
  }
  const raw = readJsonConfig(filePath, errors);
  if (raw === undefined) {
    return { locked: [], present: true, invalid: true };
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    errors.push({
      path: filePath,
      kind: "unexpected-shape",
      detail: "skills-lock.json is not a JSON object",
    });
    return { locked: [], present: true, invalid: true };
  }
  const skills = (raw as Record<string, unknown>).skills;
  if (skills === null || typeof skills !== "object" || Array.isArray(skills)) {
    errors.push({
      path: filePath,
      kind: "unexpected-shape",
      detail: "skills-lock.json has no `skills` object",
    });
    return { locked: [], present: true, invalid: true };
  }

  const locked: LockedSkillFact[] = [];
  for (const [id, value] of Object.entries(skills as Record<string, unknown>)) {
    const entry: LockedSkillFact = { id };
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const v = value as Record<string, unknown>;
      if (typeof v.source === "string") {
        entry.source = v.source;
      }
      if (typeof v.skillPath === "string") {
        entry.skillPath = v.skillPath;
      }
      if (typeof v.computedHash === "string") {
        entry.computedHash = v.computedHash;
      }
    }
    locked.push(entry);
  }
  return { locked, present: true };
}
