import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanContext, tmpProject, write } from "../helpers/tmp";
import { defaultConfig } from "../../src/config/schema";
import { extractFacts } from "../../src/discover/extract";
import { ruleIds } from "../helpers/scan";
import { withEnv } from "../helpers/env";

const RULE = "codex.agent.missing-field";
const VALID = 'name = "reviewer"\ndescription = "Reviews diffs."\ndeveloper_instructions = "Review the change."\n';

describe("codex.agent.missing-field (docs/spec/codex-agents.md)", () => {
  test("a complete agent file is clean", () => {
    const root = tmpProject("agentscan-codex-agent-ok-");
    write(root, ".codex/agents/reviewer.toml", VALID);
    expect(ruleIds(root)).not.toContain(RULE);
  });

  test("missing developer_instructions is an error", () => {
    const root = tmpProject("agentscan-codex-agent-missing-");
    write(root, ".codex/agents/reviewer.toml", 'name = "reviewer"\ndescription = "Reviews diffs."\n');
    expect(ruleIds(root)).toContain(RULE);
  });

  test("a non-string name counts as missing", () => {
    const root = tmpProject("agentscan-codex-agent-type-");
    write(root, ".codex/agents/reviewer.toml", VALID.replace('name = "reviewer"', "name = 1"));
    expect(ruleIds(root)).toContain(RULE);
  });

  test("CODEX_HOME/agents is read only under --global", () => {
    const root = tmpProject("agentscan-codex-agent-home-");
    const codexHome = mkdtempSync(join(tmpdir(), "agentscan-codex-agent-althome-"));
    write(codexHome, "agents/bad.toml", 'name = "bad"\n');
    withEnv({ CODEX_HOME: codexHome }, () => {
      const path = join(codexHome, "agents", "bad.toml");
      const local = extractFacts(scanContext(root), defaultConfig);
      expect(local.agents.some((a) => a.path === path)).toBe(false);
      const global = extractFacts(scanContext(root), { ...defaultConfig, includeGlobal: true });
      const agent = global.agents.find((a) => a.path === path);
      expect(agent?.codexMissingFields).toEqual(["description", "developer_instructions"]);
    });
  });
});
