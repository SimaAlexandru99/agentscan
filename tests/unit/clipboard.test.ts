import { describe, expect, test } from "bun:test";
import { clipboardCandidates } from "../../src/report/clipboard";

/** Stand-in for "is this binary on PATH". */
const have =
  (...names: string[]) =>
  (name: string): boolean =>
    names.includes(name);

const bins = (...names: string[]): string[] =>
  clipboardCandidates(have(...names)).map((c) => c[0] as string);

describe("clipboardCandidates", () => {
  test("keeps every installed tool, not just the first", () => {
    // Being on PATH does not mean it works. On a headless WSL shell both
    // wl-copy and xclip are installed and both exit 1 for want of a display,
    // while clip.exe succeeds. Picking one up front would have failed there.
    expect(bins("wl-copy", "xclip", "clip.exe")).toEqual([
      "wl-copy",
      "xclip",
      "clip.exe",
    ]);
  });

  test("orders native session tools ahead of the WSL bridge", () => {
    expect(bins("clip.exe", "wl-copy")).toEqual(["wl-copy", "clip.exe"]);
  });

  test("carries the arguments each tool needs to reach the clipboard", () => {
    // xclip and xsel default to the PRIMARY selection, which is not what
    // anyone means by "copy" — both need to be told the clipboard explicitly.
    expect(clipboardCandidates(have("xclip"))).toEqual([
      ["xclip", "-selection", "clipboard"],
    ]);
    expect(clipboardCandidates(have("xsel"))).toEqual([
      ["xsel", "--clipboard", "--input"],
    ]);
    expect(clipboardCandidates(have("pbcopy"))).toEqual([["pbcopy"]]);
  });

  test("returns nothing when no tool is installed, rather than guessing", () => {
    expect(clipboardCandidates(have())).toEqual([]);
  });
});
