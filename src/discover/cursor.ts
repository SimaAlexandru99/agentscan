import { join } from "node:path";
import { CURSOR_HOOK_HANDLER_TYPES } from "../facts/cursor";
import { providerHome } from "../facts/providers";
import type { HookFact, McpFact } from "../facts/types";
import { commandHook, readFlatHooks } from "./hooks";
import { isRecord, type ScanIO } from "./fs";
import { parseMcpFile } from "./mcp";

/**
 * Workspace `.cursor/hooks.json`.
 *
 * Flat arrays of `{ command, type?, matcher?, timeout?, loop_limit?,
 * failClosed? }`, so this never routes through `hooksFromObject`, whose group
 * handling is built for Claude's nested shape. `type` is optional here and
 * defaults to `"command"` — emitting Claude's "required type" rule against this
 * file would flag every documented example.
 *
 * `timeout` is seconds and `loop_limit` / `failClosed` change behaviour, never
 * whether a hook runs; no check reads them, so they are not recorded.
 *
 * See docs/spec/cursor-hooks.md.
 */
export function discoverCursorHooksFile(
  filePath: string,
  projectRoot: string,
  io: ScanIO,
): HookFact[] {
  return readFlatHooks(filePath, "cursor", io, (item, base) => {
    if (!isRecord(item)) {
      return base({ defect: "command-without-command" });
    }
    if (item.type !== undefined) {
      const declared = typeof item.type === "string" ? item.type : undefined;
      if (declared === undefined || !CURSOR_HOOK_HANDLER_TYPES.has(declared)) {
        return base({
          defect: "unknown-handler-type",
          unknownHandlerType: declared ?? JSON.stringify(item.type),
        });
      }
    }
    // `command` is required for every entry, `type: "prompt"` included: the
    // options table marks it required with no per-type exception and
    // documents no separate `prompt` field.
    const command = typeof item.command === "string" ? item.command : undefined;
    // Quoted: project hooks "Run from the project root", and a relative
    // `./hooks/script.sh` really does resolve to `<project>/hooks/script.sh`.
    return commandHook(base(), command, projectRoot);
  });
}

/**
 * User MCP at `~/.cursor/mcp.json`. Only called under `--global`.
 * `version` is ignored: the page does not require it.
 * See docs/spec/cursor-mcp.md.
 */
export function discoverCursorUserMcp(projectRoot: string, io: ScanIO): McpFact[] {
  return parseMcpFile(join(providerHome("cursor"), "mcp.json"), projectRoot, io, { optional: true });
}
