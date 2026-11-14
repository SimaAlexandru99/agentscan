# Codex custom agents

**Source:** https://learn.chatgpt.com/docs/agent-configuration/subagents
**Read:** 2026-11-14
**Depends on it:** `codex.agent.missing-field`

Quoted:

> Every standalone custom agent file must define: name, description, developer_instructions

## Files

| Scope | Path | Opened by agentscan |
|-------|------|---------------------|
| Project | `<dir>/.codex/agents/*.toml` | yes, on the ancestor walk |
| User | `$CODEX_HOME/agents/*.toml` (default `~/.codex/agents`) | `--global` only |

Dotfiles, other extensions and subdirectories are skipped. Invalid TOML is
the existing `config.unreadable` error and gets no field check. A field that
is present but not a string counts as missing. The agent is named by `name`,
or the filename stem when `name` is absent. Other fields are not checked.

## Staleness risk: HIGH
