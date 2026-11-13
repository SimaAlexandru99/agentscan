import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mkPinnedRoot } from "../helpers/tmp";
import { findings as projectFindings } from "../helpers/scan";

/**
 * Hooks in a plugin's `hooks/hooks.json` are one of the seven documented
 * registration sites, and until plan 020 this tool read two of them. Shapes
 * here are taken from the reference and corroborated against 17 installed
 * plugins: `${CLAUDE_PLUGIN_ROOT}` in 31 of 33 commands, an optional top-level
 * `description` in 10 of 17 files. See docs/spec/hook-sources.md.
 */
function project(): string {
  const root = mkPinnedRoot("agentscan-plugin-");
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

describe("plugin hooks", () => {
  test("a missing ${CLAUDE_PLUGIN_ROOT} script is reported, naming the plugin file", () => {
    const root = project();
    plugin(root, "guard-plugin", guard("${CLAUDE_PLUGIN_ROOT}/scripts/gone.sh"));

    const findings = projectFindings(root).filter(
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

    expect(projectFindings(root).filter((f) => f.ruleId.startsWith("hook."))).toEqual([]);
  });

  test("a double-quoted ${CLAUDE_PLUGIN_ROOT} script resolves like an unquoted one", () => {
    const root = project();
    const dir = plugin(root, "quoted-plugin", guard('"${CLAUDE_PLUGIN_ROOT}/scripts/te-hook"'));
    mkdirSync(join(dir, "scripts"), { recursive: true });
    writeFileSync(join(dir, "scripts", "te-hook"), "#!/bin/sh\n");
    expect(projectFindings(root).filter((f) => f.ruleId === "claude.hook.missing-script")).toEqual([]);

    plugin(root, "quoted-gone", guard('"${CLAUDE_PLUGIN_ROOT}/scripts/gone"'));
    const missing = projectFindings(root).filter((f) => f.ruleId === "claude.hook.missing-script");
    expect(missing).toHaveLength(1);
    expect(missing[0]!.message).not.toContain('"');
  });

  test("the scan root itself can be the plugin", () => {
    // `claude --plugin-dir .` — a plugin repo scanned from inside it.
    const root = project();
    mkdirSync(join(root, "hooks"), { recursive: true });
    writeFileSync(
      join(root, "hooks", "hooks.json"),
      JSON.stringify({ hooks: guard("${CLAUDE_PLUGIN_ROOT}/bin/absent.sh") }),
    );

    const findings = projectFindings(root).filter(
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

    expect(projectFindings(root).filter((f) => f.ruleId === "claude.hook.missing-script")).toEqual([]);
  });

  test("an unknown event in a plugin is reported like any other", () => {
    const root = project();
    plugin(root, "typo-plugin", {
      PreToolUseX: [{ hooks: [{ type: "command", command: "echo hi" }] }],
    });

    const findings = projectFindings(root).filter(
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

    const findings = projectFindings(root);
    expect(findings.some((f) => f.ruleId === "config.unreadable")).toBe(true);
  });
});
