import type { CommandcodeAgentDefect, Facts } from "../facts/types";
import type { Finding } from "../findings";
import { isShadowed } from "../facts/precedence";
import { assertNever } from "../facts/provider";
import { make } from "./make";
import type { RuleId } from "./registry";

function commandcodeAgentRule(defect: CommandcodeAgentDefect): RuleId {
  switch (defect) {
    case "reserved-name":
      return "commandcode.agent.reserved-name";
    case "invalid-permission-mode":
      return "commandcode.agent.invalid-permission-mode";
    case "invalid-field-type":
      return "commandcode.agent.invalid-field-type";
    default: {
      return assertNever(defect, `unhandled Command Code agent defect: ${defect}`);
    }
  }
}

function commandcodeAgentMessage(
  agent: Facts["agents"][number],
  defect: CommandcodeAgentDefect,
): string {
  switch (defect) {
    case "reserved-name":
      return `Agent name "${agent.name}" is reserved and will be ignored`;
    case "invalid-permission-mode":
      return `Agent "${agent.name}" has invalid permissionMode "${agent.permissionMode ?? "unknown"}"`;
    case "invalid-field-type":
      return `Agent "${agent.name}" field "${agent.invalidField ?? "unknown"}" has the wrong type`;
    default: {
      return assertNever(defect, `unhandled Command Code agent defect: ${defect}`);
    }
  }
}

function commandcodeAgentSuggest(
  agent: Facts["agents"][number],
  defect: CommandcodeAgentDefect,
): string {
  switch (defect) {
    case "reserved-name":
      return `Rename ${agent.path} — explore, plan, review, and general are reserved`;
    case "invalid-permission-mode":
      return `Use permissionMode default, accept-edits, yolo, plan, or dont-ask in ${agent.path}`;
    case "invalid-field-type":
      return `Fix the type of ${agent.invalidField ?? "the field"} in ${agent.path}`;
    default: {
      return assertNever(defect, `unhandled Command Code agent defect: ${defect}`);
    }
  }
}

function checkCommandcodeAgents(facts: Facts): Finding[] {
  const out: Finding[] = [];
  for (const agent of facts.agents) {
    if (agent.sourceProvider !== "commandcode") {
      continue;
    }
    if (isShadowed(agent)) {
      continue;
    }
    if (agent.unreadable === true || agent.unparseableFrontmatter === true) {
      continue;
    }
    for (const defect of agent.commandcodeDefects ?? []) {
      out.push(
        make(commandcodeAgentRule(defect), `agent:${agent.name}`, {
          message: commandcodeAgentMessage(agent, defect),
          reason:
            "Command Code custom agents ignore reserved names (explore, plan, review, general), accept permissionMode from a closed list, and drop mistyped fields. Filename supplies name when frontmatter omits it. See docs/spec/commandcode-agents.md.",
          evidence: [{ kind: "agent", value: agent.path }],
          suggest: commandcodeAgentSuggest(agent, defect),
        }),
      );
    }
  }
  return out;
}

function checkCodexAgents(facts: Facts): Finding[] {
  const out: Finding[] = [];
  for (const agent of facts.agents) {
    if (agent.sourceProvider !== "codex" || agent.codexMissingFields === undefined) {
      continue;
    }
    const fields = agent.codexMissingFields.join(", ");
    out.push(
      make("codex.agent.missing-field", `agent:${agent.path}`, {
        message: `Codex agent "${agent.name}" does not define string ${fields}`,
        reason:
          "Every standalone Codex custom agent file must define name, description, and developer_instructions. See docs/spec/codex-agents.md.",
        evidence: [{ kind: "agent", value: agent.path }],
        suggest: `Add ${fields} as strings to ${agent.path}`,
      }),
    );
  }
  return out;
}

/**
 * Agent definitions, checked for structure only.
 *
 * Frontmatter `name` is deliberately not compared to the filename — see
 * docs/spec/skills.md for the same trap, and the regression test that guards it.
 *
 * VS Code agents default `name` to the filename and do not require frontmatter;
 * applying `claude.agent.*` to them is a false positive. See docs/spec/vscode-agents.md.
 * Duplicate names are scoped to one `namespace` (one `.claude/agents` directory).
 */
export function checkAgents(facts: Facts): Finding[] {
  const out: Finding[] = [];
  const names = new Map<string, string[]>();
  for (const agent of facts.agents) {
    if (agent.sourceProvider !== "claude") {
      continue;
    }
    if (agent.unreadable === true || agent.unparseableFrontmatter === true) {
      // config.unreadable names it. Anything else here would be a statement
      // about a file the adjacent finding admits we could not read.
      continue;
    }

    if (!agent.hasFrontmatter) {
      out.push(
        make("claude.agent.missing-frontmatter", `agent:${agent.name}`, {
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
          message: "Agent frontmatter has no `name`",
          reason: "Agent identity is declared by the required frontmatter name.",
          evidence: [{ kind: "agent", value: agent.path }],
          suggest: "Add a `name` field to the frontmatter",
        }),
      );
    } else {
      const name = agent.frontmatterName;
      // Only the documented skip conditions fire; `reviewer-v2` and other
      // off-format names load fine. See docs/spec/agents.md.
      if (name.trim() === "" || name.startsWith("-") || name.includes(":") || name.length > 256) {
        out.push(
          make("claude.agent.invalid-name", `agent:${agent.name}`, {
            message: `Agent name "${name.slice(0, 80)}" is skipped (empty, starts with "-", contains ":", or longer than 256 characters)`,
            reason:
              "Claude Code skips a subagent whose name is empty, starts with `-`, contains `:`, or is longer than 256 characters, and writes an error to the debug log. See docs/spec/agents.md.",
            evidence: [{ kind: "agent", value: agent.path }],
            suggest: "Use a non-empty name of at most 256 characters that does not start with `-` or contain `:`",
          }),
        );
      }
      const scope = agent.namespace ?? "";
      const key = `${scope}\0${agent.frontmatterName}`;
      const list = names.get(key) ?? [];
      if (list.includes(agent.path)) {
        continue;
      }
      list.push(agent.path);
      names.set(key, list);
    }
  }
  for (const [key, paths] of names) {
    if (paths.length > 1) {
      const name = key.slice(key.indexOf("\0") + 1);
      out.push(
        make("claude.agent.duplicate-name", `agent:${name}`, {
          message: `Agent name "${name}" is declared by multiple files`,
          reason:
            "Duplicate names make dispatch ambiguous within one `.claude/agents` directory, including its subfolders. The same name in a different walk-up layer is nearest-wins, not a duplicate. See docs/spec/agents.md and, for the directory scope, docs/spec/claude-subagents.md.",
          evidence: paths.map((path) => ({ kind: "agent", value: path })),
          suggest: "Give each agent a unique frontmatter name",
        }),
      );
    }
  }
  return [...out, ...checkCommandcodeAgents(facts), ...checkCodexAgents(facts), ...checkFactoryDroids(facts)];
}

/** See docs/spec/factory-agents.md. */
function checkFactoryDroids(facts: Facts): Finding[] {
  const out: Finding[] = [];
  for (const agent of facts.agents) {
    if (agent.sourceProvider !== "factory") {
      continue;
    }
    for (const defect of agent.factoryDroidDefects ?? []) {
      out.push(
        defect === "invalid-name"
          ? make("factory.droid.invalid-name", `agent:${agent.path}`, {
              message: `Droid "${agent.name}" has no frontmatter name matching ^[a-z0-9-_]+$`,
              reason:
                "Factory requires `name` (lowercase letters, digits, `-`, `_`); it drives the `subagent_type` value. The CLI validates every definition and exposes only valid droids. See docs/spec/factory-agents.md.",
              evidence: [{ kind: "agent", value: agent.path }],
              suggest: `Set a lowercase name in ${agent.path}`,
            })
          : make("factory.droid.empty-body", `agent:${agent.path}`, {
              message: `Droid "${agent.name}" has an empty system prompt`,
              reason:
                "The body after the frontmatter is the droid's system prompt and cannot be empty. See docs/spec/factory-agents.md.",
              evidence: [{ kind: "agent", value: agent.path }],
              suggest: `Write the system prompt below the frontmatter in ${agent.path}`,
            }),
      );
    }
  }
  return out;
}
