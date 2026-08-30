export type RuleProvenance =
  | "spec-required"
  | "vendor-recommendation"
  | "security"
  | "internal-consistency"
  | "heuristic";

export type StructuralCheck = {
  id: string;
  description: string;
  provenance: RuleProvenance;
  lastVerified: string;
};
