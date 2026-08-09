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

describe("skillReferences — refuses to guess", () => {
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
