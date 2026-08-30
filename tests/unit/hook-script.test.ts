import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runChecks } from "../../src/checks/index";
import { defaultConfig } from "../../src/config/schema";
import { discoverAgentSurface, hookScriptPath } from "../../src/discover/index";
import { extractFacts } from "../../src/facts/extract";

/**
 * Every case here is a real hook command taken from this machine's projects.
 * A false "your guard hook is broken" is as harmful as missing a real one, so
 * anything ambiguous must return undefined rather than guess.
 */

describe("hookScriptPath — extracts", () => {
  test("bare relative path under a dot directory", () => {
    expect(hookScriptPath("node .claude/hooks/protect-env.js")).toBe(
      ".claude/hooks/protect-env.js",
    );
  });

  test("quoted bare relative path", () => {
    expect(
      hookScriptPath('node ".claude/skills/impeccable/scripts/hook.mjs"'),
    ).toBe(".claude/skills/impeccable/scripts/hook.mjs");
  });

  test("explicit ./ and ../ forms", () => {
    expect(hookScriptPath("bash ./scripts/x.sh")).toBe("./scripts/x.sh");
    expect(hookScriptPath("sh ../shared/y.sh")).toBe("../shared/y.sh");
  });

  test("absolute binary path", () => {
    expect(hookScriptPath("/home/simaa/.local/bin/graphify hook-guard read")).toBe(
      "/home/simaa/.local/bin/graphify",
    );
  });

  test("home-relative path", () => {
    expect(hookScriptPath("~/bin/my-hook.sh --flag")).toBe("~/bin/my-hook.sh");
  });

  test("$CLAUDE_PROJECT_DIR and braced form", () => {
    expect(
      hookScriptPath('node "$CLAUDE_PROJECT_DIR/.claude/hooks/react-doctor.mjs"'),
    ).toBe("$CLAUDE_PROJECT_DIR/.claude/hooks/react-doctor.mjs");
    expect(
      hookScriptPath('node "${CLAUDE_PROJECT_DIR}/.claude/hooks/a.mjs"'),
    ).toBe("${CLAUDE_PROJECT_DIR}/.claude/hooks/a.mjs");
  });

  test("interpreter flags before the path", () => {
    expect(hookScriptPath("python3 -u .claude/hooks/h.py")).toBe(
      ".claude/hooks/h.py",
    );
  });

  test("${CLAUDE_PLUGIN_ROOT} only where a plugin defines it", () => {
    // 31 of 33 hook commands across 17 installed plugins use this placeholder,
    // so refusing it would read 2 of them. In a settings file there is no
    // plugin and so no base — expanding it there would be an invented answer.
    // See docs/spec/hook-sources.md.
    const command = 'bash "${CLAUDE_PLUGIN_ROOT}/hooks/sg-python.sh"';
    expect(hookScriptPath(command, { plugin: "/plugins/sg" })).toBe(
      "${CLAUDE_PLUGIN_ROOT}/hooks/sg-python.sh",
    );
    expect(hookScriptPath(command)).toBeUndefined();
  });

  test("an unquoted plugin-root path is extracted too", () => {
    expect(
      hookScriptPath("${CLAUDE_PLUGIN_ROOT}/scripts/format.sh", {
        plugin: "/plugins/fmt",
      }),
    ).toBe("${CLAUDE_PLUGIN_ROOT}/scripts/format.sh");
  });
});

describe("hookScriptPath — refuses to guess", () => {
  test("inline script bodies are not paths", () => {
    expect(
      hookScriptPath(
        `node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync(0,'utf8'));"`,
      ),
    ).toBeUndefined();
    expect(hookScriptPath('python3 -c "import json"')).toBeUndefined();
  });

  test("bare commands on PATH", () => {
    expect(hookScriptPath("bun x ultracite fix")).toBeUndefined();
    expect(hookScriptPath("bun run typecheck 2>&1 | tail -20")).toBeUndefined();
    expect(hookScriptPath("rtk git status")).toBeUndefined();
  });

  test("a command that guards its own missing file", () => {
    // Reporting this would be a false positive — the `[ ! -f ... ]` is the guard.
    expect(
      hookScriptPath(
        '[ ! -f "${CLAUDE_PROJECT_DIR}/.claude/skills/impeccable/scripts/hook.mjs" ] || node "${CLAUDE_PROJECT_DIR}/.claude/skills/impeccable/scripts/hook.mjs"',
      ),
    ).toBeUndefined();
  });

  test("shell compounds and substitutions", () => {
    expect(
      hookScriptPath(`CMD=$(python3 -c "import json,sys") && echo x`),
    ).toBeUndefined();
    expect(
      hookScriptPath(`f=$(jq -r '.tool_input.file_path // ""'); if echo "$f"`),
    ).toBeUndefined();
    expect(
      hookScriptPath('cd "/tmp/x" && npx tsc --noEmit'),
    ).toBeUndefined();
    expect(hookScriptPath("node a.js || node b.js")).toBeUndefined();
  });

  test("unresolvable env var and windows drive paths", () => {
    expect(hookScriptPath('node "$SOME_OTHER_VAR/x.js"')).toBeUndefined();
    expect(hookScriptPath('cd "e:/vreaulacurs/mobile"')).toBeUndefined();
  });

  test("empty and whitespace", () => {
    expect(hookScriptPath("")).toBeUndefined();
    expect(hookScriptPath("   ")).toBeUndefined();
  });
});

describe("hook script discovery", () => {
  test("directories are missing scripts, while files and absent paths stay distinct", () => {
    const root = mkdtempSync(join(tmpdir(), "agentscan-hook-"));
    const hooksDir = join(root, ".claude", "hooks");
    mkdirSync(join(hooksDir, "directory.js"), { recursive: true });
    writeFileSync(join(hooksDir, "regular.js"), "", "utf8");
    writeFileSync(
      join(root, ".claude", "settings.json"),
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              hooks: [
                { type: "command", command: "node .claude/hooks/directory.js" },
                { type: "command", command: "node .claude/hooks/regular.js" },
                { type: "command", command: "node .claude/hooks/missing.js" },
              ],
            },
          ],
        },
      }),
      "utf8",
    );

    const surface = discoverAgentSurface(root, defaultConfig, { includeGlobal: false });
    const facts = extractFacts(root, defaultConfig, { includeGlobal: false });
    const hooks = new Map(
      surface.hooks.map((hook) => [hook.scriptPath, hook.scriptExists]),
    );

    expect(hooks.get(".claude/hooks/directory.js")).toBe(false);
    expect(hooks.get(".claude/hooks/regular.js")).toBe(true);
    expect(hooks.get(".claude/hooks/missing.js")).toBe(false);
    expect(
      runChecks(facts)
        .filter((finding) => finding.ruleId === "claude.hook.missing-script")
        .map((finding) => finding.subject),
    ).toEqual([
      "hook:PreToolUse:.claude/hooks/directory.js",
      "hook:PreToolUse:.claude/hooks/missing.js",
    ]);
  });
});
