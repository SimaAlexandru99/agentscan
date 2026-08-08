import { describe, expect, test } from "bun:test";
import { VERSION } from "../src/version";

describe("scaffold", () => {
  test("VERSION is 0.1.0", () => {
    expect(VERSION).toBe("0.1.0");
  });
});
