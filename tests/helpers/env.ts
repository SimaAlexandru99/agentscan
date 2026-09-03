/**
 * Tests that simulate a user home mock `os.homedir()`. Every provider also
 * honours an env override that wins over `homedir()`, so a developer with
 * `CODEX_HOME` (or a sibling) exported saw those tests fail on their machine
 * while CI stayed green. Clear the overrides once for the whole suite; the
 * tests that need one set and restore it themselves.
 */
for (const key of ["CODEX_HOME", "GROK_HOME", "CLAUDE_CONFIG_DIR", "COPILOT_HOME"]) {
  delete process.env[key];
}
