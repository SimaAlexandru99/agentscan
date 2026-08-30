import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runChecks } from "../../src/checks/index";
import { defaultConfig } from "../../src/config/schema";
import { extractFacts } from "../../src/facts/extract";

/**
 * Hooks in a plugin's `hooks/hooks.json` are one of the seven documented
 * registration sites, and until plan 020 this tool read two of them. Shapes
 * here are taken from the reference and corroborated against 17 installed
 * plugins: `${CLAUDE_PLUGIN_ROOT}` in 31 of 33 commands, an optional top-level
 * `description` in 10 of 17 files. See docs/spec/hook-sources.md.
 */
function project(): string {
  const root = mkdtempSync(join(tmpdir(), "agentscan-plugin-"));
  writeFileSync(join(root, "package.json"), "{}");
  return root;
}

function plugin(root: string, name: string, hooks: unknown, extra: object = {}) {
  const dir = join(root, name);
  mkdirSync(join(dir, ".claude-plugin"), { recursive: true });
  mkdirSync(join(dir, "hooks"), { recursive: true });
  writeFileSync(
    join(dir, ".claude-plugin", "plugin.json"),
    JSON.stringify({ name, version: "1.0.0" }),
  );
  writeFileSync(
    join(dir, "hooks", "hooks.json"),
    JSON.stringify({ ...extra, hooks }),
  );
  return dir;
}

function guard(command: string) {
  return {
    PreToolUse: [
      { matcher: "Bash", hooks: [{ type: "command", command }] },
    ],
  };
}

function findingsFor(root: string) {
  return runChecks(extractFacts(root, defaultConfig, { includeGlobal: false }));
}

describe("plugin hooks", () => {
  test("a missing ${CLAUDE_PLUGIN_ROOT} script is reported, naming the plugin file", () => {
    const root = project();
    plugin(root, "guard-plugin", guard("${CLAUDE_PLUGIN_ROOT}/scripts/gone.sh"));

    const findings = findingsFor(root).filter(
      (f) => f.ruleId === "claude.hook.missing-script",
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("error");
    expect(
      findings[0]!.evidence.some((e) => e.value.includes("hooks/hooks.json")),
    ).toBe(true);
  });

  test("a present ${CLAUDE_PLUGIN_ROOT} script is silent", () => {
    const root = project();
    const dir = plugin(
      root,
      "ok-plugin",
      guard("bash ${CLAUDE_PLUGIN_ROOT}/scripts/check.sh"),
      { description: "Automatic checks" },
    );
    mkdirSync(join(dir, "scripts"), { recursive: true });
    writeFileSync(join(dir, "scripts", "check.sh"), "echo ok\n");

    expect(findingsFor(root).filter((f) => f.ruleId.startsWith("hook."))).toEqual([]);
  });

  test("the scan root itself can be the plugin", () => {
    // `claude --plugin-dir .` — a plugin repo scanned from inside it.
    const root = project();
    mkdirSync(join(root, "hooks"), { recursive: true });
    writeFileSync(
      join(root, "hooks", "hooks.json"),
      JSON.stringify({ hooks: guard("${CLAUDE_PLUGIN_ROOT}/bin/absent.sh") }),
    );

    const findings = findingsFor(root).filter(
      (f) => f.ruleId === "claude.hook.missing-script",
    );
    expect(findings).toHaveLength(1);
  });

  test("${CLAUDE_PLUGIN_ROOT} in a settings file stays unresolved", () => {
    // There is no plugin there, so there is no base. Guessing the project root
    // would be the invention this parser refuses.
    const root = project();
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(
      join(root, ".claude", "settings.json"),
      JSON.stringify({ hooks: guard("${CLAUDE_PLUGIN_ROOT}/scripts/gone.sh") }),
    );

    expect(findingsFor(root).filter((f) => f.ruleId === "claude.hook.missing-script")).toEqual([]);
  });

  test("an unknown event in a plugin is reported like any other", () => {
    const root = project();
    plugin(root, "typo-plugin", {
      PreToolUseX: [{ hooks: [{ type: "command", command: "echo hi" }] }],
    });

    const findings = findingsFor(root).filter(
      (f) => f.ruleId === "claude.hook.unknown-event",
    );
    expect(findings).toHaveLength(1);
  });

  test("a malformed hooks.json is a config error, not a dead scan", () => {
    const root = project();
    const dir = join(root, "broken-plugin");
    mkdirSync(join(dir, ".claude-plugin"), { recursive: true });
    mkdirSync(join(dir, "hooks"), { recursive: true });
    writeFileSync(join(dir, ".claude-plugin", "plugin.json"), "{}");
    writeFileSync(join(dir, "hooks", "hooks.json"), "{ not json");

    const findings = findingsFor(root);
    expect(findings.some((f) => f.ruleId === "config.unreadable")).toBe(true);
  });
});
