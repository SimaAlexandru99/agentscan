import type { Facts, Finding } from "../facts/types";
import { make } from "./make";

/**
 * Agent definitions, checked for structure only.
 *
 * Two checks, not four. `agent.unknown-model` and `agent.unknown-tool` were
 * planned and cut: both would hardcode a list of valid values and report
 * anything absent from it, which is exactly the shape of the hook-event list
 * that held 9 of 31 names and called a working hook dead at severity error.
 * Model ids change and MCP tool names are per-machine. See plans/003 for the
 * conditions under which they may return.
 *
 * Frontmatter `name` is deliberately not compared to the filename — see
 * docs/spec/skills.md for the same trap, and the regression test that guards it.
 */
export function checkAgents(facts: Facts): Finding[] {
  const out: Finding[] = [];
  const names = new Map<string, string[]>();
  for (const agent of facts.agents) {
    if (agent.unreadable === true || agent.unparseableFrontmatter === true) {
      // config.unreadable names it. Anything else here would be a statement
      // about a file the adjacent finding admits we could not read.
      continue;
    }

    if (!agent.hasFrontmatter) {
      out.push(
        make("claude.agent.missing-frontmatter", `agent:${agent.name}`, {
          action: "warn",
          severity: "error",
          message: "Agent definition has no YAML frontmatter block",
          reason:
            "An agent is selected by its declared description; without a frontmatter block there is nothing to select on, and the file is unlikely to load as an agent at all.",
          evidence: [{ kind: "agent", value: agent.path }],
          suggest: "Add a --- delimited block with a description",
        }),
      );
      continue;
    }
    if (agent.description === undefined) {
      out.push(
        make("claude.agent.missing-description", `agent:${agent.name}`, {
          action: "warn",
          severity: "error",
          message: "Agent frontmatter has no `description`",
          reason:
            "The description is how the main session decides which agent to dispatch. Without one the agent can still be named explicitly, but it will not be chosen on its own.",
          evidence: [{ kind: "agent", value: agent.path }],
          suggest: "Add a one-line description saying when to dispatch it",
        }),
      );
    }
    if (agent.frontmatterName === undefined) {
      out.push(
        make("claude.agent.missing-name", `agent:${agent.name}`, {
          action: "warn",
          severity: "error",
          message: "Agent frontmatter has no `name`",
          reason: "Agent identity is declared by the required frontmatter name.",
          evidence: [{ kind: "agent", value: agent.path }],
          suggest: "Add a `name` field to the frontmatter",
        }),
      );
    } else {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(agent.frontmatterName)) {
        out.push(
          make("claude.agent.invalid-name", `agent:${agent.name}`, {
            action: "warn",
            // Warning, not error. The reference states the format — "Unique
            // identifier using lowercase letters and hyphens" — but names a
            // load failure only for `:`. Error means "this does not work", and
            // the docs do not say that about `name: SEO Specialist`.
            // See docs/spec/agents.md.
            severity: "warning",
            message: `Agent name "${agent.frontmatterName}" is not a valid identifier`,
            reason:
              "The subagent reference specifies a unique identifier in lowercase letters and hyphens. A name outside that shape is not documented to load reliably, and a `:` in it is documented not to load at all. See docs/spec/agents.md.",
            evidence: [{ kind: "agent", value: agent.path }],
            suggest: "Use lowercase letters, numbers, and hyphens in the `name` field",
          }),
        );
      }
      const list = names.get(agent.frontmatterName) ?? [];
      list.push(agent.path); names.set(agent.frontmatterName, list);
    }
  }
  for (const [name, paths] of names) if (paths.length > 1) {
    out.push(make("claude.agent.duplicate-name", `agent:${name}`, {
      action: "warn", severity: "error", message: `Agent name "${name}" is declared by multiple files`,
      reason: "Duplicate names make dispatch ambiguous.", evidence: paths.map((path) => ({ kind: "agent", value: path })),
      suggest: "Give each agent a unique frontmatter name",
    }));
  }
  return out;
}
