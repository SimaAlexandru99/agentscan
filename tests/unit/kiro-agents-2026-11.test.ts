import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { mkPinnedProject, mkPinnedRoot, write } from "../helpers/tmp";
import { findingsFor, ruleIds } from "../helpers/scan";
import { withHome } from "../helpers/env";
import type { AgentFact } from "../../src/facts/types";

function kiroAgents(facts: { agents: AgentFact[] }): AgentFact[] {
  return facts.agents.filter((agent) => agent.sourceProvider === "kiro");
}

describe("Kiro agents", () => {
  test("json and markdown are inventory, nested names drop the extension, and no field is required", () => {
    const root = mkPinnedProject("agentscan-kiro-agents-");
    write(root, ".kiro/agents/review.json", JSON.stringify({ prompt: "Review." }));
    write(root, ".kiro/agents/plain.md", "No frontmatter.\n");
    write(
      root,
      ".kiro/agents/noted.md",
      "---\ndescription: Notes.\nhooks:\n  PreToolUse:\n    - type: command\n      command: echo no\n---\n",
    );
    write(root, ".kiro/agents/team/planner.md", "# planner\n");
    write(root, ".kiro/agents/.secret.json", "{}");
    write(root, ".kiro/agents/notes.txt", "nope");
    write(root, ".kiro/hooks/on-save.json", JSON.stringify({ name: "on-save" }));
    const facts = findingsFor(root).facts;
    const agents = kiroAgents(facts);
    expect(agents.map((agent) => agent.name).sort()).toEqual(["noted", "plain", "review", "team/planner"]);
    expect(agents.every((agent) => agent.schemaProfile === undefined)).toBe(true);
    expect(agents.every((agent) => agent.nameSource === "filename")).toBe(true);
    expect(agents.find((agent) => agent.name === "review")?.hasFrontmatter).toBe(false);
    expect(agents.find((agent) => agent.name === "plain")?.hasFrontmatter).toBe(false);
    expect(agents.find((agent) => agent.name === "noted")?.hasFrontmatter).toBe(true);
    expect(agents.every((agent) => agent.effective !== false)).toBe(true);
    expect(facts.hooks.some((hook) => hook.path.includes(`${join(".kiro", "agents")}`))).toBe(false);
    const ids = ruleIds(root);
    expect(ids.some((id) => id.startsWith("claude.agent.") || id.startsWith("kiro.agent."))).toBe(false);
  });

  test("invalid JSON is a config error and a non-object root is unexpected-shape", () => {
    const broken = mkPinnedProject("agentscan-kiro-agent-json-");
    write(broken, ".kiro/agents/broken.json", "{");
    const brokenFacts = findingsFor(broken).facts;
    expect(kiroAgents(brokenFacts).map((agent) => agent.name)).toEqual(["broken"]);
    expect(brokenFacts.configErrors.some((err) => err.path.endsWith("broken.json") && err.kind === "invalid-json")).toBe(
      true,
    );

    const arrayRoot = mkPinnedProject("agentscan-kiro-agent-array-");
    write(arrayRoot, ".kiro/agents/list.json", "[]");
    const analysis = findingsFor(arrayRoot);
    expect(kiroAgents(analysis.facts).map((agent) => agent.name)).toEqual(["list"]);
    expect(analysis.facts.configErrors.map((err) => err.detail)).toContain("Kiro agent root is not an object");
  });

  test("a child agent is unread from the workspace, and a nearer file shadows the parent", () => {
    const root = mkPinnedProject("agentscan-kiro-agent-walk-");
    write(root, ".kiro/agents/review.json", JSON.stringify({ prompt: "parent" }));
    write(root, ".kiro/agents/both.json", "{}");
    write(root, ".kiro/agents/both.md", "same stem\n");
    write(root, "child/.kiro/agents/review.md", "child\n");
    write(root, "child/deeper/keep.txt", "x");
    const fromRoot = kiroAgents(findingsFor(root).facts);
    expect(fromRoot.map((agent) => agent.name).sort()).toEqual(["both", "both", "review"]);
    expect(fromRoot.every((agent) => agent.effective !== false)).toBe(true);
    expect(fromRoot.some((agent) => agent.path.includes(`${join("child", ".kiro")}`))).toBe(false);

    const fromChild = kiroAgents(findingsFor(root, false, join(root, "child")).facts);
    const childReview = fromChild.find((agent) => agent.name === "review" && agent.path.includes("child"));
    const parentReview = fromChild.find((agent) => agent.name === "review" && !agent.path.includes("child"));
    expect(childReview?.effective).not.toBe(false);
    expect(parentReview?.effective).toBe(false);
    expect(fromChild.filter((agent) => agent.name === "both").every((agent) => agent.effective !== false)).toBe(true);
  });

  test("global agents stay off unless --global, and a workspace name shadows them", () => {
    const root = mkPinnedProject("agentscan-kiro-agent-global-");
    write(root, ".kiro/agents/review.json", "{}");
    const home = mkPinnedRoot("agentscan-kiro-agent-home-");
    write(home, ".kiro/agents/review.md", "global review\n");
    write(home, ".kiro/agents/team/planner.md", "global only\n");
    withHome(home, () => {
      expect(kiroAgents(findingsFor(root, false).facts).map((agent) => agent.name)).toEqual(["review"]);
      const on = kiroAgents(findingsFor(root, true).facts);
      const workspace = on.find((agent) => agent.name === "review" && agent.path.startsWith(root));
      const global = on.find((agent) => agent.name === "review" && agent.path.startsWith(home));
      expect(workspace?.effective).not.toBe(false);
      expect(global?.effective).toBe(false);
      expect(on.find((agent) => agent.name === "team/planner")?.effective).not.toBe(false);
      expect(on.find((agent) => agent.name === "team/planner")?.path).toBe(
        join(home, ".kiro", "agents", "team", "planner.md"),
      );
    });
  });
});
