import { describe, expect, test } from "bun:test";
import { hookScriptPath } from "../../src/discover/index";

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
