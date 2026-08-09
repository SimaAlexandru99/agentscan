import { describe, expect, test } from "bun:test";
import { paint, shouldColour } from "../../src/report/ansi";

const ESC = "\u001b";

describe("shouldColour", () => {
  test("colours a terminal and nothing else", () => {
    expect(shouldColour({ isTTY: true, env: {} })).toBe(true);
    // The report is being redirected or piped — escapes would land in a file,
    // a CI log, or another program's stdin.
    expect(shouldColour({ isTTY: false, env: {} })).toBe(false);
  });

  test("NO_COLOR wins over a terminal", () => {
    // no-color.org: any non-empty value, whatever it says.
    expect(shouldColour({ isTTY: true, env: { NO_COLOR: "1" } })).toBe(false);
    expect(shouldColour({ isTTY: true, env: { NO_COLOR: "anything" } })).toBe(
      false,
    );
    // An empty value is not the convention and must not disable colour.
    expect(shouldColour({ isTTY: true, env: { NO_COLOR: "" } })).toBe(true);
  });

  test("FORCE_COLOR asks for colour through a pipe", () => {
    expect(shouldColour({ isTTY: false, env: { FORCE_COLOR: "1" } })).toBe(true);
    // `0` is how the ecosystem spells "off"; it must not read as truthy.
    expect(shouldColour({ isTTY: false, env: { FORCE_COLOR: "0" } })).toBe(
      false,
    );
  });

  test("NO_COLOR beats FORCE_COLOR when both are set", () => {
    expect(
      shouldColour({ isTTY: true, env: { NO_COLOR: "1", FORCE_COLOR: "1" } }),
    ).toBe(false);
  });

  test("--no-color beats everything, including FORCE_COLOR", () => {
    expect(
      shouldColour({
        isTTY: true,
        env: { FORCE_COLOR: "1" },
        noColorFlag: true,
      }),
    ).toBe(false);
  });
});

describe("paint", () => {
  test("disabled returns the text untouched, with no escapes at all", () => {
    const ink = paint(false);
    expect(ink.enabled).toBe(false);
    expect(ink.tone("red", "x")).toBe("x");
    expect(ink.strong("green", "x")).toBe("x");
    expect(ink.dim("x")).toBe("x");
    expect(ink.bold("x")).toBe("x");
  });

  test("enabled wraps and closes every code it opens", () => {
    const ink = paint(true);
    expect(ink.tone("red", "x")).toBe(`${ESC}[31mx${ESC}[0m`);
    expect(ink.dim("x")).toBe(`${ESC}[2mx${ESC}[0m`);
  });

  test("strong emits one code pair, not a nested reset", () => {
    // tone(bold(x)) would close the colour at the inner reset.
    const ink = paint(true);
    const out = ink.strong("green", "42");
    expect(out).toBe(`${ESC}[1m${ESC}[32m42${ESC}[0m`);
    expect(out.split(`${ESC}[0m`).length - 1).toBe(1);
  });
});
