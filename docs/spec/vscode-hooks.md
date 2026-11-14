# VS Code agent hooks

**Source:** https://code.visualstudio.com/docs/agents/reference/hooks-reference
**Also:** https://code.visualstudio.com/docs/agent-customization/hooks
**Read:** 2026-11-14
**Re-read:** 2026-09-07 (agent frontmatter hooks parsed as vscode-native)

The source page is now titled "Legacy Local hooks reference". Quoted
(2026-11-14): "Use this reference to interpret an existing Local hook while
migrating to the Copilot harness. For new hooks, start with Configure agent
hooks, which uses the shared Copilot runtime." Also quoted: "The Local harness
is deprecated and will be removed in February 2027." New Copilot hooks are `version: 1`
camelCase files, documented in [copilot-hooks.md](copilot-hooks.md). A
numeric `version` does not select a different Local payload. This profile
stays the eight PascalCase command-only events. Do not delete them to match
the customization guide: that guide's event table is the Copilot harness.
**Depends on it:** `vscode.hook.unknown-event`, `vscode.hook.missing-script`,
`vscode.hook.command-without-command`, `vscode.hook.unknown-handler-type`,
`vscode.hook.invalid-group`

Copilot CLI `version: 1` files that also live under `.github/hooks` are
documented in [copilot-hooks.md](copilot-hooks.md), not here.

## Project files

Quoted:

> Workspace: `.github/hooks/*.json`

Official example (no `version` field):

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "type": "command",
        "command": "npx prettier --write ."
      }
    ]
  }
}
```

Use an explicit `type: "command"` and at least one command property. Changed
2026-11-14: "The Local parser also accepts entries without type as command
hooks." So `type` is no longer required by the page; check
`vscode.hook.unknown-handler-type` before relying on the old wording. This is a
flat array of handlers, not Claude's matcher-group wrapper. The Local reference
also says it "accepts nested Claude command groups but ignores matcher values"
(Claude-format settings files are read from `.claude/settings.json`, gated by
`chat.useClaudeHooks` on the Local harness).

Quoted locations also include custom-agent frontmatter `hooks` in
`.github/agents/*.agent.md` (scanned as vscode-native) and plugin
`hooks.json` / `hooks/hooks.json`. In-tree Claude plugins
(`.claude-plugin/plugin.json`) stay Claude. VS Code marketplace plugin
install directories are unread (path changes; not a project file).

Quoted command properties: `cwd`, `env`, `timeout`, and OS-specific overrides
(`windows` / `linux` / `osx`). Official docs select the OS-specific command
from the extension host platform. Added 2026-11-14: "It accepts `timeoutSec`
when `timeout` is absent. Do not specify both timeout aliases when migrating;
the Copilot runtime gives them the opposite precedence."

A launch whose `windows` / `linux` / `osx` platform does not match
`process.platform` is still inventoried, but `scriptExists` stays unset and
`vscode.hook.missing-script` is not emitted.

Unresolved interpolations, drive-relative `C:foo`, Windows drive/UNC values
on Linux or macOS, and POSIX absolute paths on Windows skip the existence
check rather than inventing a folder under the project.

## Events (eight)

`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PreCompact`,
`SubagentStart`, `SubagentStop`, `Stop`.

Do not validate these files against the Claude 33-event set, and do not
accept Copilot camelCase names (`sessionStart`) unless the file is Copilot
CLI (`version: 1`).

**CHANGED-MEANING (2026-11-14, not yet acted on):** the Local reference now
says: "Local accepts PascalCase and Copilot event aliases in hook files; a
numeric version does not select a different Local payload schema." The
customization guide repeats it: "The Local parser accepts PascalCase and Copilot
event aliases, command aliases, and nested Claude command groups." If "Copilot
event aliases" covers camelCase names, the rule above and
`vscode.hook.unknown-event` need an owner decision. The page does not say which
names count.

## Other locations (read 2026-09-02)

Quoted location table rows beyond `.github/hooks/*.json`:

> Workspace (Claude format) | `.claude/settings.json`, `.claude/settings.local.json`
> Custom agent | `hooks` field in `.agent.md` frontmatter (see Agent-scoped hooks)
> Plugin | `hooks.json` or `hooks/hooks.json`, depending on the plugin format

The Claude-format files are read with the Claude profile (VS Code says it
"parses Claude Code's hook configuration format"). `.github/agents/*.md`
frontmatter `hooks:` is read as VS Code hooks. Plugin `hooks.json` is unread —
the page does not say where a VS Code plugin root sits inside a repository.

Quoted Copilot CLI conversion: "VS Code parses Copilot CLI hook configurations
and converts the lowerCamelCase hook event names (like `preToolUse`) to the
PascalCase format used by VS Code." The page does not say how it tells a
Copilot CLI file apart; this scanner keys on `version: 1`, which the Copilot
reference documents as the file format marker. A camelCase name in a file
without `version: 1` therefore stays `vscode.hook.unknown-event`.

## User location

Quoted user scope: `~/.copilot/hooks`, `~/.claude/settings.json`.
`~/.copilot/hooks` is scanned only under `--global`. Files there with
`version: 1` are Copilot CLI; files without it stay native VS Code.
`~/.claude/settings.json` is Claude user settings, opened only under `--global`.

Quoted: workspace hooks take precedence over user hooks for the same event.

## Staleness risk: HIGH
