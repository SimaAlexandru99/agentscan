/**
 * Library entry (`import { analyze } from "@chimix/agentscan"`). The same
 * guarantees as `check`: read-only, no network. The CLI is `src/cli.ts`.
 */
export { analyze, type AnalyzeOptions, type Analysis } from "./analyze";
export type { Evidence, Finding, RuleProvenance, Severity } from "./findings";
export { VERSION } from "./version";
