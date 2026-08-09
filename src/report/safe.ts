const MAX_RENDERED = 200;

/**
 * Escape untrusted text before it reaches a terminal.
 *
 * Everything interpolated into a human-facing report — skill ids, hook event
 * names, MCP server names, paths — comes from the scanned project, which is
 * precisely what this tool does not trust. A POSIX filename may contain a
 * newline, so an unescaped subject can forge whole report lines; escape
 * sequences reach the terminal emulator and, in CI, the build log.
 *
 * Escaped rather than stripped: silently deleting the bytes would hide the
 * tampering. JSON output is deliberately left faithful — JSON.stringify already
 * escapes control characters, and consumers need the real path.
 */
export function safe(value: string): string {
  const escaped = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, (ch) => {
    if (ch === "\n") {
      return "\\n";
    }
    if (ch === "\r") {
      return "\\r";
    }
    if (ch === "\t") {
      return "\\t";
    }
    return `\\x${ch.charCodeAt(0).toString(16).padStart(2, "0")}`;
  });
  return escaped.length > MAX_RENDERED
    ? `${escaped.slice(0, MAX_RENDERED)}…`
    : escaped;
}
