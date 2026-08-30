import { describe, expect, test } from "bun:test";

import { preferredType, varyIncludesAccept } from "../lib/accept";

describe("preferredType", () => {
  test("text/markdown wins", () => {
    expect(preferredType("text/markdown")).toBe("text/markdown");
  });

  test("q-values prefer markdown when it ranks higher", () => {
    expect(preferredType("text/markdown, text/html;q=0.8")).toBe(
      "text/markdown",
    );
  });

  test("text/html wins when it is the only positive type", () => {
    expect(preferredType("text/html")).toBe("text/html");
  });

  test("q=0 markdown falls through to html", () => {
    expect(preferredType("text/markdown;q=0, text/html")).toBe("text/html");
  });

  test("rejecting every produced type is unsatisfiable", () => {
    expect(preferredType("text/markdown;q=0")).toBeNull();
  });

  test("missing Accept defaults to html", () => {
    expect(preferredType(null)).toBe("text/html");
  });

  test("*/* defaults to html", () => {
    expect(preferredType("*/*")).toBe("text/html");
  });

  test("client order breaks a q-value tie", () => {
    expect(preferredType("text/markdown, text/html, */*")).toBe(
      "text/markdown",
    );
  });

  test("application/pdf matches nothing we produce", () => {
    expect(preferredType("application/pdf")).toBeNull();
  });
});

describe("varyIncludesAccept", () => {
  test("finds Accept among other tokens", () => {
    expect(
      varyIncludesAccept(
        "rsc, next-router-state-tree, next-router-prefetch, Accept",
      ),
    ).toBe(true);
  });

  test("is case-insensitive", () => {
    expect(varyIncludesAccept("accept")).toBe(true);
  });

  test("false when missing", () => {
    expect(varyIncludesAccept("rsc, next-router-state-tree")).toBe(false);
    expect(varyIncludesAccept(null)).toBe(false);
  });
});
