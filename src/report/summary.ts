import { basename } from "node:path";
import type { Finding, Severity } from "../findings";
import { score, scoreBand, type ScoreBand } from "./score";

/** What every report shows, decided once: text, json, prompt and the exit code read it. */
export type Summary = {
  sorted: Finding[];
  /** The text body: everything under `--verbose`, else info stays hidden. */
  visible: Finding[];
  /** Error and warning findings: the prompt's work items and the `--fail-on warning` gate. */
  actionable: Finding[];
  counts: Record<Severity, number>;
  /** Info findings left out of `visible`; 0 under `--verbose`. */
  infoHidden: number;
  score: number;
  band: ScoreBand;
};

/** `findings` arrive sorted: `analyze()` sorts them once. */
export function summarize(sorted: Finding[], options: { verbose: boolean }): Summary {
  const actionable = sorted.filter((f) => f.severity !== "info");
  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const f of sorted) {
    counts[f.severity] += 1;
  }
  const points = score(sorted);
  return {
    sorted,
    visible: options.verbose ? sorted : actionable,
    actionable,
    counts,
    infoHidden: options.verbose ? 0 : counts.info,
    score: points,
    band: scoreBand(points),
  };
}

/** The project's name in a report heading: the root's last segment, or the root itself (`/`). */
export function projectLabel(root: string): string {
  return basename(root) || root;
}
