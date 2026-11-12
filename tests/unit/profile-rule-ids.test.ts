import { describe, expect, test } from "bun:test";
import { STRUCTURAL_CHECKS } from "../../src/checks/registry";
import {
  HOOK_PROFILES,
  hookRuleId,
  type HookRuleKind,
  type HookSchemaProfile,
} from "../../src/facts/hook-profiles";
import {
  COMMANDCODE_MCP_DEFECTS,
  MCP_PROFILES,
  mcpNoLaunchRuleId,
  OPENCODE_MCP_DEFECTS,
} from "../../src/facts/mcp-profiles";
import type { McpSchemaProfile } from "../../src/facts/provider";

const registered = new Set<string>(STRUCTURAL_CHECKS.map((check) => check.id));

function hookRuleIds(profile: HookSchemaProfile): string[] {
  const spec = HOOK_PROFILES[profile];
  const kinds: HookRuleKind[] = ["unknown-event", "missing-script", ...spec.defects];
  if (spec.timeout !== undefined) {
    kinds.push("timeout-out-of-bounds");
  }
  return kinds.map((kind) => hookRuleId(profile, kind));
}

describe("profile tables only produce registered rule ids", () => {
  test("every hook profile × declared defect", () => {
    const ids = (Object.keys(HOOK_PROFILES) as HookSchemaProfile[]).flatMap(hookRuleIds);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.filter((id) => !registered.has(id))).toEqual([]);
  });

  test("every MCP profile no-launch id and MCP defect id", () => {
    const ids = [
      ...(Object.keys(MCP_PROFILES) as McpSchemaProfile[]).map(mcpNoLaunchRuleId),
      ...Object.keys(OPENCODE_MCP_DEFECTS).map((defect) => `opencode.mcp.${defect}`),
      ...Object.keys(COMMANDCODE_MCP_DEFECTS).map((defect) => `commandcode.mcp.${defect}`),
    ];
    expect(ids.filter((id) => !registered.has(id))).toEqual([]);
  });
});
