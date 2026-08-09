import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyToClipboard } from "../../src/report/clipboard";

/**
 * These drive the real spawn path. PATH is replaced outright so the machine's
 * own clipboard tools cannot join in and make the result depend on whether a
 * display server happens to be running.
 */
let dir: string;
let originalPath: string | undefined;

// PATH is replaced with `dir` alone, and node:child_process hands that PATH to
// the child too — so a fake that runs a bare `cat` cannot find one. Absolute
// paths keep the fakes independent of the PATH the test is manipulating.
const fake = (name: string, body: string): void => {
  const path = join(dir, name);
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "agentscan-clip-"));
  originalPath = process.env.PATH;
  process.env.PATH = dir;
});

afterEach(() => {
  process.env.PATH = originalPath;
  rmSync(dir, { recursive: true, force: true });
});

describe("copyToClipboard", () => {
  test("feeds the report to the tool's stdin, unmodified", async () => {
    const sink = join(dir, "captured");
    fake("pbcopy", `/bin/cat > "${sink}"`);

    // Multi-byte and newlines: a report carries both, and clip.exe mangling
    // line endings is a known cost of that fallback.
    const text = "line one\nsecond — ünïcode\n";
    const result = await copyToClipboard(text);

    expect(result).toEqual({ ok: true, tool: "pbcopy" });
    expect(readFileSync(sink, "utf8")).toBe(text);
  });

  test("falls through to the next tool when one exits non-zero", async () => {
    // The real headless-WSL shape: installed but unusable, then one that works.
    const sink = join(dir, "captured");
    fake("wl-copy", "echo 'no wayland' >&2; exit 1");
    fake("xclip", "exit 1");
    fake("clip.exe", `/bin/cat > "${sink}"`);

    const result = await copyToClipboard("payload");

    expect(result).toEqual({ ok: true, tool: "clip.exe" });
    expect(readFileSync(sink, "utf8")).toBe("payload");
  });

  test("names every tool it tried when they all fail", async () => {
    fake("wl-copy", "exit 1");
    fake("pbcopy", "exit 1");

    const result = await copyToClipboard("payload");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("wl-copy");
      expect(result.reason).toContain("pbcopy");
    }
  });

  test("says so plainly when nothing is installed", async () => {
    const result = await copyToClipboard("payload");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("no clipboard tool found");
    }
  });
});
