/**
 * Parse JSON or JSONC. Comments are stripped only outside strings so a
 * VS Code `mcp.json` with `//` notes is not `config.unreadable`.
 */
export function parseJsonc(text: string): unknown {
  const stripped = stripJsonc(text);
  return JSON.parse(stripped) as unknown;
}

function stripJsonc(text: string): string {
  let out = "";
  let i = 0;
  let inString = false;
  let quote: '"' | "'" | undefined;
  let escaped = false;
  while (i < text.length) {
    const ch = text[i]!;
    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === quote) {
        inString = false;
        quote = undefined;
      }
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === "/" && text[i + 1] === "/") {
      i += 2;
      while (i < text.length && text[i] !== "\n") {
        i += 1;
      }
      continue;
    }
    if (ch === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) {
        i += 1;
      }
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}
