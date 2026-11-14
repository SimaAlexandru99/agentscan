# Kilo Code skills

**Source:** https://kilo.ai/docs/customize/skills
**Read:** 2026-11-14
**Depends on it:** `agent-skills.skill.*` on `.kilo/skills`

Quoted locations: `~/.kilo/skills/` (global), `.kilo/skills/` (project).
Compatibility: `.agents/skills/` (already scanned) and `.claude/skills/`
when Claude Code Compatibility is enabled — those files stay Claude / Agent
Skills, not remapped to Kilo.

Quoted Agent Skills fields: `name` yes (64 chars, lowercase/hyphens);
`description` yes (1024).

## Name vs directory: CHANGED-MEANING (self-contradictory page, read 2026-11-14)

The page gives three passages that disagree. Quoted verbatim:

1. Skills-URL index section: "name: The skill name (must match the directory name)"
2. "Name Matching Rule": "In Kilo Code, the name field must match the parent directory name:"
   (example `name: my-frontend-skill` in `frontend-design/` marked "doesn't match!")
3. Troubleshooting: "Verify frontmatter: Ensure name and description are present in the YAML frontmatter. The name does not need to match the directory name but should be unique across all loaded skills."

Also the troubleshooting table: "name doesn't match directory" → "Make name match exactly".

Previous capture (2026-09-07) recorded no name-to-directory rule for Kilo.
Rule-affected: `agent-skills.skill.name-does-not-match-directory` on `.kilo/skills`.
Until the vendor resolves this, do not treat a mismatch as a load failure for
Kilo; the scanner's behaviour is a decision for the rule owner, not this capture.

## Deliberately unread

- Extra skill paths and remote URLs in `kilo.jsonc`.

## Staleness risk: MEDIUM
