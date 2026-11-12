import type { Finding } from "../findings";
import type { Tone } from "./ansi";

/**
 * Points deducted per finding. Published deliberately — see the note below.
 */
export const ERROR_COST = 10;
export const WARNING_COST = 3;

/**
 * A 0–100 score: start at 100, deduct per finding by severity, floor at zero.
 *
 *     score = max(0, 100 - 10 x errors - 3 x warnings)
 *
 * **Deduction, not coverage.** The obvious model — passed checks over total
 * checks — was measured against 17 real projects and rejected: every one landed
 * between 97.7% and 100%, and it *inverted* severity, because the denominator
 * grows with the config while the defects do not. A project with 85 skills and
 * one warning outscored a project with 10 skills and one warning, for the same
 * defect. Deduction has no denominator, so it cannot do that. Verified on the
 * same 17 projects: 40 to 100, and the 85-skill project scores 97 while the
 * 54-skill one with six broken hooks scores 40.
 *
 * **Info costs nothing.** Info findings are budgets and hygiene notes, and they
 * do correlate with project size — charging for them would reintroduce exactly
 * the inversion above. Measured: including them at one point each pulled a
 * healthy 51-skill project from 94 down to 84 purely for having more config.
 *
 * **The formula is published.** Both comparable tools score 0–100 and neither
 * documents how. A number whose derivation cannot be inspected is the false
 * precision this scoring model exists to avoid; anyone can recompute this one
 * by counting two lines of the report.
 *
 * The score is a summary, not a verdict. `--fail-on <severity>` remains the
 * precise gate: it says which *kind* of problem fails a build, where a
 * threshold only says how many points of unspecified trouble is too much.
 */
export function score(findings: Finding[]): number {
  let deduction = 0;
  for (const f of findings) {
    if (f.severity === "error") {
      deduction += ERROR_COST;
    } else if (f.severity === "warning") {
      deduction += WARNING_COST;
    }
  }
  return Math.max(0, 100 - deduction);
}

export type ScoreBand = {
  label: string;
  tone: Tone;
  face: [string, string];
};

/**
 * Score bands, highest first: the word, colour and face for a score. One
 * table so the face and the word can never disagree — a smiling box next to
 * "broken" would undermine both.
 *
 * The bands are deliberately coarse and tied to what the deductions mean: 100
 * is nothing found, anything below 90 contains at least one error or three
 * warnings, and below 50 means five or more things are actively broken. The
 * tones are stricter than react-doctor's 75/50 because one error already costs
 * 10, so 89 means something is genuinely broken rather than merely imperfect.
 */
const BANDS: readonly (ScoreBand & { min: number })[] = [
  { min: 100, label: "clean", tone: "green", face: ["\u25e0 \u25e0", " \u25bd "] },
  { min: 90, label: "good", tone: "green", face: ["\u2022 \u2022", " \u203f "] },
  { min: 70, label: "needs work", tone: "yellow", face: ["\u2022 \u2022", " \u2500 "] },
  { min: 50, label: "poor", tone: "yellow", face: ["\u25e1 \u25e1", " \u2312 "] },
  { min: 0, label: "broken", tone: "red", face: ["\u2715 \u2715", " \u2312 "] },
];

export function scoreBand(points: number): ScoreBand {
  return BANDS.find((band) => points >= band.min) ?? (BANDS.at(-1) as ScoreBand);
}
