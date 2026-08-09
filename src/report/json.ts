import type { Facts, Finding } from "../facts/types";
import { score } from "./score";
import { sortFindings } from "./sort";

export function renderJson(args: {
  version: string;
  root: string;
  facts: Facts;
  findings: Finding[];
  resolvedFrom?: string;
}): string {
  const { version, root, facts, findings } = args;
  const depCount =
    Object.keys(facts.dependencies).length +
    Object.keys(facts.devDependencies).length;

  const payload = {
    version,
    root,
    ...(args.resolvedFrom === undefined
      ? {}
      : { resolvedFrom: args.resolvedFrom }),
    factsSummary: {
      packageManager: facts.packageManager,
      depCount,
      skillCount: facts.skills.length,
      globalSkillCount: facts.skills.filter((s) => s.source === "global")
        .length,
    },
    // max(0, 100 - 10*errors - 3*warnings); see src/report/score.ts
    score: score(findings),
    findings: sortFindings(findings),
  };

  return `${JSON.stringify(payload, null, 2)}\n`;
}
