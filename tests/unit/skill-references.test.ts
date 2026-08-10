import { describe, expect, test } from "bun:test";
import { skillReferences } from "../../src/discover/index";

/**
 * A false "this skill points at a missing file" is as damaging as missing a
 * real one, so anything ambiguous must not be extracted.
 */

describe("skillReferences — extracts", () => {
  test("a bundled path in prose", () => {
    expect(
      skillReferences("Read references/concepts/tracing.md before starting."),
    ).toEqual(["references/concepts/tracing.md"]);
  });

  test("a bundled path in a markdown link", () => {
    expect(skillReferences("See [the report](scripts/report.ts).")).toEqual([
      "scripts/report.ts",
    ]);
  });

  test("each distinct path once, in first-appearance order", () => {
    expect(
      skillReferences("a scripts/b.ts then assets/c.png then scripts/b.ts"),
    ).toEqual(["scripts/b.ts", "assets/c.png"]);
  });

  test("every conventional bundled directory", () => {
    const body = [
      "scripts/a.sh",
      "references/b.md",
      "assets/c.png",
      "templates/d.hbs",
      "examples/e.ts",
    ].join(" ");
    expect(skillReferences(body)).toHaveLength(5);
  });
});

describe("skillReferences — shapes that are real references", () => {
  test("a ./ prefix", () => {
    expect(skillReferences("See ./references/a.md")).toEqual([
      "references/a.md",
    ]);
  });

  test("an uppercase extension", () => {
    expect(skillReferences("See references/A.MD")).toEqual(["references/A.MD"]);
  });

  test("an extension longer than four characters", () => {
    expect(skillReferences("Run scripts/a.python")).toEqual([
      "scripts/a.python",
    ]);
  });

  test("a compound extension is not truncated", () => {
    // reporting `references/existing.md` missing when the file is
    // `references/existing.md.backup` names a path that was never referenced
    expect(skillReferences("See references/existing.md.backup")).toEqual([
      "references/existing.md.backup",
    ]);
  });

  test("a real reference after a stray mid-line backtick run", () => {
    expect(skillReferences("a ``` b\nRead references/real.md")).toEqual([
      "references/real.md",
    ]);
  });
});

describe("skillReferences — refuses to guess", () => {
  test("a path inside a URL, including its query string", () => {
    expect(
      skillReferences("https://example.com/f?path=scripts/not-local.js"),
    ).toEqual([]);
  });

  test("tilde and four-backtick fences are code blocks too", () => {
    expect(skillReferences("~~~\nreferences/x.md\n~~~")).toEqual([]);
    expect(skillReferences("````\nreferences/y.md\n````")).toEqual([]);
  });

  test("inline code is a bundled pointer", () => {
    expect(skillReferences("Run `scripts/deploy.sh` in your project")).toEqual(
      ["scripts/deploy.sh"],
    );
  });

  test("URLs are not local paths", () => {
    expect(
      skillReferences("https://example.com/scripts/x.md is upstream"),
    ).toEqual([]);
  });

  test("a path nested under another directory is not ours", () => {
    expect(skillReferences("node_modules/scripts/x.js")).toEqual([]);
    expect(skillReferences("packages/web/references/y.md")).toEqual([]);
  });

  test("paths inside fenced code blocks are examples, not pointers", () => {
    const body = [
      "Real: references/real.md",
      "```bash",
      "cat references/illustrative.md",
      "```",
    ].join("\n");
    expect(skillReferences(body)).toEqual(["references/real.md"]);
  });

  test("a bare filename with no bundled prefix", () => {
    expect(skillReferences("See README.md and SKILL.md")).toEqual([]);
  });

  test("a directory with no file extension", () => {
    expect(skillReferences("everything under references/concepts")).toEqual([]);
  });

  test("empty body", () => {
    expect(skillReferences("")).toEqual([]);
  });
});
