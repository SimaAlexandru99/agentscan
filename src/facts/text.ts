/**
 * How agent-config text is read. Shared by discovery and checks so a line count
 * or an interpolation means the same thing on both sides.
 */

/**
 * Lines the way `wc -l` counts them: a trailing newline terminates the last
 * line, it does not start another one.
 */
export function lineCount(text: string): number {
  return text.length === 0 ? 0 : text.replace(/\r?\n$/, "").split(/\r?\n/).length;
}

// `%VAR%` is Gemini CLI's documented Windows-only env syntax (docs/spec/gemini-mcp.md).
// `{{var}}` is Grok's documented header / env interpolation (docs/spec/grok-mcp.md).
const NON_PERCENT_INTERPOLATED =
  /\$\{[A-Za-z_][A-Za-z0-9_]*(?::-[^}]*)?\}|\$\{env:[A-Za-z_][A-Za-z0-9_]*\}|\$\{file:[^}]+\}|\$\{input:[A-Za-z0-9_-]+\}|\$\{(?:userHome|workspaceFolder|workspaceFolderBasename|pathSeparator|\/)\}|\{env:[A-Za-z_][A-Za-z0-9_]*\}|\$\{\{\s*secrets\.[A-Za-z0-9_.]+\s*\}\}|\{\{[^{}]+\}\}|\$[A-Za-z_][A-Za-z0-9_]*/;

/** A value that is an interpolated reference rather than a literal. */
export const INTERPOLATED = new RegExp(`${NON_PERCENT_INTERPOLATED.source}|%[A-Za-z_][A-Za-z0-9_]*%`);

/** Qwen Code documents only `$VAR` and `${VAR}`; `%VAR%` stays literal (docs/spec/qwen-mcp.md). */
export const INTERPOLATED_NO_PERCENT = NON_PERCENT_INTERPOLATED;
