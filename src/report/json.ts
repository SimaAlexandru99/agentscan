import type { Facts } from "../facts/types";
import type { Finding } from "../findings";
import { summarize } from "./summary";

export function renderJson(args: {
  version: string;
  root: string;
  facts: Facts;
  findings: Finding[];
  resolvedFrom?: string;
}): string {
  const { version, root, facts } = args;
  const summary = summarize(args.findings, { verbose: true });
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
    score: summary.score,
    findings: summary.sorted,
  };

  return `${JSON.stringify(payload, null, 2)}\n`;
}
