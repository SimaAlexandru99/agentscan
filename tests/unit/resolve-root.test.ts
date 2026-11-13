import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveCommandcodeProjectRoot } from "../../src/discover/commandcode";
import { hasAgentConfigSignal, resolveRoot, resolveScanContext } from "../../src/discover/scan-context";
import { mkPinnedRoot } from "../helpers/tmp";
import { withHome } from "../helpers/env";
import { analyze } from "../../src/analyze";

describe("resolveRoot", () => {

  test("prefers the starting agent-config dir over a parent package.json", () => {
    const parent = mkPinnedRoot("agentscan-root-parent-");
    writeFileSync(join(parent, "package.json"), '{"name":"mono"}', "utf8");
    const child = join(parent, "notes");
    mkdirSync(join(child, ".claude"), { recursive: true });
    expect(resolveRoot(child)).toBe(child);
  });

  test("a pin stops walk-up before a parent git root or agent signal", () => {
    const parent = mkPinnedRoot("agentscan-root-pin-parent-");
    mkdirSync(join(parent, ".git"), { recursive: true });
    mkdirSync(join(parent, ".claude"), { recursive: true });
    const child = join(parent, "isolated");
    mkdirSync(child, { recursive: true });
    writeFileSync(join(child, ".agentscan-root"), "", "utf8");
    expect(() => resolveRoot(child)).toThrow(
      /No package\.json or agent configuration found/,
    );
  });

  test("uses a .cursor directory without package.json", () => {
    const root = mkPinnedRoot("agentscan-root-cursor-");
    mkdirSync(join(root, ".cursor"), { recursive: true });
    expect(hasAgentConfigSignal(root)).toBe(true);
    expect(resolveRoot(root)).toBe(root);
  });

  test("uses a .vscode directory without package.json", () => {
    const root = mkPinnedRoot("agentscan-root-vscode-");
    mkdirSync(join(root, ".vscode"), { recursive: true });
    expect(resolveRoot(root)).toBe(root);
  });

  test("uses a .github directory without package.json", () => {
    const root = mkPinnedRoot("agentscan-root-github-");
    mkdirSync(join(root, ".github"), { recursive: true });
    expect(resolveRoot(root)).toBe(root);
  });

  test("prefers a child .cursor over a parent package.json", () => {
    const parent = mkPinnedRoot("agentscan-root-cursor-child-");
    writeFileSync(join(parent, "package.json"), '{"name":"mono"}', "utf8");
    const child = join(parent, "notes");
    mkdirSync(join(child, ".cursor"), { recursive: true });
    expect(resolveRoot(child)).toBe(child);
  });

  test("falls back to a git root when no provider signal exists", () => {
    const root = mkPinnedRoot("agentscan-root-git-");
    mkdirSync(join(root, ".git"), { recursive: true });
    const nested = join(root, "pkg", "src");
    mkdirSync(nested, { recursive: true });
    expect(resolveRoot(nested)).toBe(root);
  });

  test("scanBoundary stays at git when a child .cursor is the project root", () => {
    const parent = mkPinnedRoot("agentscan-scan-bound-");
    mkdirSync(join(parent, ".git"), { recursive: true });
    mkdirSync(join(parent, ".claude"), { recursive: true });
    const child = join(parent, "apps", "web");
    mkdirSync(join(child, ".cursor"), { recursive: true });
    const ctx = resolveScanContext(child);
    expect(ctx.root).toBe(child);
    expect(ctx.scanBoundary).toBe(parent);
    expect(resolveCommandcodeProjectRoot(ctx)).toBe(parent);
    expect(ctx.repositoryBoundary).toBe(parent);
  });

  test("Command Code project root is cwd when there is no git repo", () => {
    const parent = mkPinnedRoot("agentscan-cc-root-cwd-");
    writeFileSync(join(parent, "package.json"), '{"name":"mono"}', "utf8");
    const child = join(parent, "apps", "web");
    mkdirSync(join(child, ".cursor"), { recursive: true });
    const ctx = resolveScanContext(child);
    expect(ctx.root).toBe(child);
    expect(resolveCommandcodeProjectRoot(ctx)).toBe(child);
    expect(ctx.repositoryBoundary).toBeUndefined();
  });

  test("a nearer package.json wins over a parent provider signal", () => {
    const parent = mkPinnedRoot("agentscan-root-pkg-vs-signal-");
    mkdirSync(join(parent, ".claude"), { recursive: true });
    const child = join(parent, "pkg");
    mkdirSync(child, { recursive: true });
    writeFileSync(join(child, "package.json"), '{"name":"pkg"}', "utf8");
    expect(resolveRoot(child)).toBe(child);
  });
});

describe("--global without a project", () => {
  test("scans global locations instead of failing", () => {
    const empty = mkPinnedRoot("agentscan-global-empty-");
    const home = mkPinnedRoot("agentscan-global-home-");
    mkdirSync(join(home, ".claude", "agents"), { recursive: true });
    writeFileSync(
      join(home, ".claude", "agents", "x.md"),
      "---\nname: plug:x\ndescription: d\n---\n",
      "utf8",
    );
    expect(() => analyze({ dir: empty })).toThrow(/No package\.json or agent configuration found/);
    const ids = withHome(home, () => analyze({ dir: empty, global: true })).findings.map((f) => f.ruleId);
    expect(ids).toContain("claude.agent.invalid-name");
  });
});
