import { basename } from "node:path";
import type { Facts, Finding } from "../facts/types";
import { make } from "./make";

/**
 * Strip source text out of a parser's message.
 *
 * Parsers quote the offending fragment back — `Unexpected identifier "ghp_…"`,
 * `Unresolved alias …: ghp_…`. When the unparseable file is an MCP config or a
 * SKILL.md that fragment can be a credential, and it reached both the text
 * report and `--json`, which the README tells people to pipe into CI logs. A
 * tool whose flagship check reports hardcoded secrets must not print one.
 *
 * Only the position survives, because only the position is actionable. Redacting
 * by token shape was the alternative and is strictly worse: it catches six known
 * shapes, and a parser can quote any source at all.
 */
function safeDetail(detail: string): string {
  const position = detail.match(/\bline \d+(?:, column \d+)?/i)?.[0];
  const kind = detail.split(/[:(]/)[0]?.trim().slice(0, 60);
  const head = kind !== undefined && kind.length > 0 ? kind : "parse error";
  return position === undefined ? head : `${head} at ${position}`;
}
export function checkConfigErrors(facts: Facts): Finding[] {
  return facts.configErrors.map((err) => {
    // Truncation is a limit of this scan, not a defect in the scanned file:
    // the file is valid and the tools that read it see all of it. Reporting it
    // as `config.unreadable` at error said the opposite, and cost a real
    // project 40 points for four files that work.
    if (err.kind === "truncated") {
      return make("scan.truncated", `scan:${err.path}`, {
        action: "warn",
        severity: "info",
        message: `${basename(err.path)} is larger than the scan cap — only its first bytes were read`,
        reason:
          "The file itself is fine; agentscan reads a bounded prefix of it. Checks that read the body — skill.broken-reference, and the AGENTS.md / CLAUDE.md line counts — see only that prefix, so they can undercount on this file.",
        evidence: [
          { kind: "config", value: err.path },
          { kind: "detail", value: err.detail },
        ],
      });
    }
    const what =
      err.kind === "invalid-json"
        ? "is not valid JSON"
        : err.kind === "unreadable"
          ? "could not be read"
          : "has an unexpected shape";
    // One file can fail several ways at once — three invalid package.json
    // fields gave three findings sharing one id, and `explain` reached only the
    // first. The kind and detail disambiguate without changing the common case.
    return make("config.unreadable", `config:${err.path}#${err.kind}:${safeDetail(err.detail)}`, {
      action: "warn",
      severity: "error",
      message: `${basename(err.path)} ${what} — its contents are invisible to the scan`,
      reason:
        "An unparseable config is silently ignored by the tools that read it, so whatever it configured is simply not in effect.",
      evidence: [
        { kind: "config", value: err.path },
        { kind: "detail", value: safeDetail(err.detail) },
      ],
      suggest: `Fix the syntax in ${err.path}`,
    });
  });
}
