import type { RuleSource } from "../checks/provenance";
import type { Finding } from "../facts/types";

/**
 * Strip the scheme and any trailing slash so a source fits on a report line
 * next to the label and the date. `https://` carries no information a reader
 * needs here, and the full URL is one `explain` away.
 */
export function shortSourceUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/**
 * `spec-required · cursor.com/docs/hooks · read 2026-09-03`, or
 * `internal-consistency · no vendor page · agentscan inference`.
 *
 * The second half is the point: a rule with no vendor page says so rather than
 * printing a bare label a reader cannot weigh. Both render, always — an absent
 * line would be a silent signal, and silence is what this whole change exists
 * to remove.
 */
export function provenanceLine(finding: Finding): string {
  return `${finding.provenance} · ${sourcePhrase(finding.source, finding.lastVerified)}`;
}

function sourcePhrase(source: RuleSource, lastVerified: string): string {
  if (source.kind === "spec") {
    return `${shortSourceUrl(source.url)} · read ${lastVerified}`;
  }
  return `no vendor page · ${source.detail}`;
}
