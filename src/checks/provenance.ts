export type RuleProvenance =
  | "spec-required"
  | "vendor-recommendation"
  | "security"
  | "internal-consistency"
  | "heuristic";

/**
 * Where a rule's assertion comes from, in a form the CLI can show a user.
 *
 * The evidence discipline behind these checks lived only in `docs/spec/`, which
 * the npm package does not ship — so a reader could not tell a line quoted from
 * a vendor page from an inference of our own. Both render as `error`.
 *
 * `spec` names the page and the capture file holding the verbatim quote;
 * `docs/spec` is on GitHub, so `capture` is a reader's shortest path to the
 * quoted lines. `derived` is the honest alternative: there is no vendor page,
 * and the phrase says what the rule actually rests on. Never dress an inference
 * or a blog measurement up as a spec — `budget.agents-md` is `derived` for
 * exactly that reason.
 */
export type RuleSource =
  | { kind: "spec"; url: string; capture: string }
  | { kind: "derived"; detail: string };

export type StructuralCheck = {
  id: string;
  description: string;
  provenance: RuleProvenance;
  lastVerified: string;
  /**
   * Required, not optional. A new rule that cannot say where it came from
   * should not compile — that is the half of this contract a convention cannot
   * enforce.
   */
  source: RuleSource;
};
