// ESM entry: the UMD build does `require("./impl/format")`, which bun's Node
// bundle leaves unresolved against dist/cli.js.
import { parse, printParseErrorCode, type ParseError } from "jsonc-parser/lib/esm/main.js";

/**
 * Parse JSON or JSONC with a dedicated parser so comments and trailing commas
 * (OpenCode / VS Code) are valid, while unterminated comments stay unreadable.
 */
export function parseJsonc(text: string): unknown {
  const errors: ParseError[] = [];
  const value = parse(text, errors, {
    allowTrailingComma: true,
    disallowComments: false,
    allowEmptyContent: false,
  });
  if (errors.length > 0) {
    const first = errors[0]!;
    throw new Error(`${printParseErrorCode(first.error)} at offset ${first.offset}`);
  }
  return value;
}
