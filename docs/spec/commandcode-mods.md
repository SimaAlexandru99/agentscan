# Command Code mods

**Source:** https://commandcode.ai/docs/mods
**Read:** 2026-08-31
**Depends on it:** none (inventory only)

Mods are TypeScript packages loaded against `ModApi`. Settings declare
`mods: { sources?, paths?, disabled? }`
([commandcode-settings.md](commandcode-settings.md)).

Coverage is **experimental / inventory-only**. Record declared paths. Never
execute, `import()`, or compile a mod file — that would break the scan-path
guarantees (no writes, no running untrusted code from the scanned tree).

Do not invent required-field checks for `ModApi` surface area.

## Staleness risk: HIGH
