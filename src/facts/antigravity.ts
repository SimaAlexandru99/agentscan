/**
 * Antigravity hook facts. See docs/spec/antigravity-hooks.md.
 *
 * The file maps hook names to definitions. Event arrays mix matcher groups
 * and direct handlers, so this is not Claude's nested object and not Devin's
 * root-is-the-hooks-object file.
 */

/** Quoted event table on https://antigravity.google/docs/hooks (read 2026-11-12). */
export const ANTIGRAVITY_HOOK_EVENTS = new Set([
  "SessionStart",
  "PreToolUse",
  "PostToolUse",
  "PreInvocation",
  "PostInvocation",
  "Stop",
]);
