import { describe, expect, test } from "bun:test";
import { applyPrecedence, isShadowed } from "../../src/facts/precedence";

describe("applyPrecedence", () => {
  test("best rank wins per key, first wins ties, unranked stays unset", () => {
    type Item = { key: string; rank?: number; effective?: boolean };
    const items: Item[] = [
      { key: "a", rank: 1 },
      { key: "a", rank: 2 },
      { key: "a", rank: 2 },
      { key: "b", rank: 0 },
      { key: "b" },
    ];
    applyPrecedence(items, (i) => i.key, (i) => i.rank);
    expect(items.map((i) => i.effective)).toEqual([false, true, false, true, undefined]);
    expect(items.map(isShadowed)).toEqual([true, false, true, false, false]);
  });
});
