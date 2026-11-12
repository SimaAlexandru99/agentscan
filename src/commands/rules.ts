import { ignoreRuleSet } from "../checks/registry";
import { STRUCTURAL_CHECKS } from "../checks/index";
import { severityLabel, type StructuralCheck } from "../checks/provenance";
import { loadProject } from "../analyze";
import { shortSourceUrl } from "../report/provenance-line";
import type { CommandResult } from "./result";

export type RulesCommandOptions = {
  dir?: string;
  configPath?: string;
  json?: boolean;
};


function sourceColumn(check: StructuralCheck): string {
  return check.source.kind === "spec"
    ? shortSourceUrl(check.source.url)
    : `(${check.source.detail})`;
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + " ".repeat(width - value.length);
}

/**
 * Print every id that can produce a finding, with where it comes from.
 *
 * The ids are the ones `ignoreRules` takes, and each finding's id starts with
 * one of them, so this is also the index for `ignoreFindings`.
 *
 * The provenance and source columns are the reason this command is worth
 * reading: they are what separates a rule quoted from a vendor page from one
 * this tool infers.
 */
export function runRulesCommand(options: RulesCommandOptions = {}): CommandResult {
  const { config } = loadProject(options);

  const ignored = ignoreRuleSet(config.ignoreRules);
  const active = STRUCTURAL_CHECKS.filter((c) => !ignored.has(c.id));

  if (options.json === true) {
    return { exitCode: 0, stdout: `${JSON.stringify(active, null, 2)}\n` };
  }

  const idWidth = active.reduce((max, c) => Math.max(max, c.id.length), 0);
  const sevWidth = active.reduce((max, c) => Math.max(max, severityLabel(c).length), 0);
  const provWidth = active.reduce((max, c) => Math.max(max, c.provenance.length), 0);
  const lines = active.map(
    (c) =>
      `${pad(c.id, idWidth)}  ${pad(severityLabel(c), sevWidth)}  ${pad(c.provenance, provWidth)}  ${sourceColumn(c)}  ${c.description}`,
  );

  return {
    exitCode: 0,
    stdout: lines.length > 0 ? `${lines.join("\n")}\n` : "",
  };
}
