import { parse as parseYaml } from "yaml";
import { lineCount } from "../facts/text";
import type { YamlScalarKind } from "../facts/types";
export type { YamlScalarKind };
import { isRecord, readCapped, type ScanIO } from "./fs";

const SKILL_MD_CAP = 65_536;


export type Frontmatter = {
  hasFrontmatter: boolean;
  body?: string;
  /** The block exists but the parser rejected it — fields are unknown, absent. */
  unparseable?: boolean;
  unreadable?: boolean;
  name?: string;
  nameKind?: YamlScalarKind;
  description?: string;
  descriptionKind?: YamlScalarKind;
  /**
   * The `hooks` mapping, unvalidated — a skill or subagent may declare hooks
   * "in the same configuration format as settings-based hooks". Handed to
   * `hooksFromObject`, which owns the shape checks.
   *
   * See docs/spec/hook-sources.md.
   */
  hooks?: unknown;
  fields?: Record<string, unknown>;
  lineCount?: number;
  whenToUse?: string;
};

function yamlScalarKind(value: unknown): YamlScalarKind | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    return "string";
  }
  if (typeof value === "number") {
    return "number";
  }
  if (typeof value === "boolean") {
    return "boolean";
  }
  return "other";
}

function scalarString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export type SplitFrontmatter =
  | { kind: "none"; text: string }
  | { kind: "unclosed"; text: string }
  | { kind: "invalid"; text: string; error: string }
  | { kind: "not-mapping"; text: string }
  | { kind: "ok"; text: string; record: Record<string, unknown>; end: number };

/** Locate and parse a leading `---` YAML block; `text` is BOM-stripped and LF-normalised. */
export function splitFrontmatter(raw: string): SplitFrontmatter {
  let text = raw;
  // Several Windows editors write a BOM; without stripping it the `---` test
  // fails and a valid file is reported as having no frontmatter.
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  // CRLF is valid, but the closing fence is then "\r\n---" and searching for
  // "\n---" cuts inside it, leaving a stray \r that a strict YAML parser rejects.
  text = text.replace(/\r\n/g, "\n");
  if (!text.startsWith("---")) {
    return { kind: "none", text };
  }
  // The closing fence is a line that is exactly `---` (YAML also allows `...`).
  // Matching a bare "\n---" prefix took a key named `---metadata` for the fence.
  const fence = /\n(?:---|\.\.\.)[ \t]*(?:\n|$)/.exec(text.slice(3));
  if (fence === null) {
    return { kind: "unclosed", text };
  }
  const end = 3 + fence.index;
  let block: unknown;
  try {
    block = parseYaml(text.slice(3, end)) as unknown;
  } catch (err) {
    return {
      kind: "invalid",
      text,
      error: err instanceof Error ? (err.message.split("\n")[0] as string) : String(err),
    };
  }
  if (!isRecord(block)) {
    return { kind: "not-mapping", text };
  }
  return { kind: "ok", text, record: block, end };
}

/**
 * Parse the `---` block with a real YAML parser.
 *
 * This was regex-based, and every fix uncovered another shape it read wrong: an
 * empty `name:` captured the following line, and folded scalars (`description: >`
 * with the text indented beneath) recorded ">" as the value. Tightening the
 * regex only converted a wrong value into a wrong "field is missing" — the file
 * is valid YAML and the description is right there. `yaml` is already a
 * dependency for the rule loader, so this costs nothing new.
 */
export function readFrontmatter(
  skillMdPath: string,
  io: ScanIO,
): Frontmatter {
  // Truncation is recorded at info and the parse continues: the frontmatter
  // sits in the first few hundred bytes, so a 67 KB SKILL.md is not broken
  // config on the strength of bytes we chose not to read.
  const result = readCapped(skillMdPath, SKILL_MD_CAP, io);
  if (result === undefined) {
    return { hasFrontmatter: false, unreadable: true };
  }
  const split = splitFrontmatter(result.text);
  const text = split.text;
  if (split.kind === "none") {
    return { hasFrontmatter: false, body: text, lineCount: lineCount(text) };
  }
  if (split.kind !== "ok") {
    io.errors.push({
      path: skillMdPath,
      kind: "unexpected-shape",
      detail:
        split.kind === "unclosed"
          ? result.truncated
            ? `frontmatter not closed within the first ${SKILL_MD_CAP} bytes`
            : "frontmatter opening --- is not closed"
          : split.kind === "invalid"
            ? `frontmatter is not valid YAML: ${split.error}`
            : "frontmatter is not a YAML mapping",
    });
    return { hasFrontmatter: true, unparseable: true, lineCount: lineCount(text) };
  }
  const end = split.end;

  const record = split.record;
  const out: Frontmatter = {
    hasFrontmatter: true,
    body: text.slice(end + 4),
    lineCount: lineCount(text),
  };
  const nameKind = yamlScalarKind(record.name);
  if (nameKind !== undefined) {
    out.nameKind = nameKind;
  }
  const name = scalarString(record.name);
  if (name !== undefined) {
    out.name = name;
  }
  const descriptionKind = yamlScalarKind(record.description);
  if (descriptionKind !== undefined) {
    out.descriptionKind = descriptionKind;
  }
  const description = scalarString(record.description);
  if (description !== undefined) {
    out.description = description;
  }
  if (record.hooks !== undefined) {
    out.hooks = record.hooks;
  }
  const whenToUse = scalarString(record.when_to_use);
  if (whenToUse !== undefined) {
    out.whenToUse = whenToUse;
  }
  out.fields = record;
  return out;
}

