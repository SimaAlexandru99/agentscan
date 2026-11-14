# Codex skills

**Source:** https://developers.openai.com/codex/skills (moved from https://learn.chatgpt.com/docs/build-skills)
**Also:** https://agentskills.io/specification (the `SKILL.md` schema the Codex page builds on)
**Read:** 2026-11-14
**Depends on it:** `agent-skills.skill.*`

Codex loads Agent Skills from `.agents/skills`, not `.codex/skills`. Product
identity stays `codex`; the file schema is `agent-skills`. The Codex page
requires `name` and `description` in `SKILL.md`. The rule that `name` matches
the directory comes from the Agent Skills spec, not the Codex page.

Quoted (2026-11-14):

> Codex reads skills from repository, user, admin, and system locations. For
> repositories, Codex scans .agents/skills in every directory from your current
> working directory up to the repository root. If two skills share the same
> name, Codex doesn't merge them; both can appear in skill selectors.

Supported locations:

- Repo: `$CWD/.agents/skills`, each parent up to the repository root, and
  `$REPO_ROOT/.agents/skills`.
- User: `$HOME/.agents/skills`.
- Admin: `/etc/codex/skills`.
- System: bundled with Codex (`skill-creator`, `skill-installer`), enabled by default.

Symlinked skill folders are followed. The page does not list `.codex/skills`
or `~/.codex/skills`; earlier captures of this file did.

Disabling: `[[skills.config]]` entries in `~/.codex/config.toml` disable one
skill. `[skills.bundled]` turns off system skills per project.

There is no separate Codex skill schema in this capture. Do not invent
Codex-only frontmatter fields.

## Staleness risk: HIGH
