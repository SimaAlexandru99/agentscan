import { existsSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { CURSOR_HOOK_HANDLER_TYPES } from "../facts/cursor";
import type { ConfigErrorFact, HookFact } from "../facts/types";
import { hookScriptPath } from "./launch";
import { readJsonConfig } from "./shared";

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function baseFact(event: string, filePath: string, extra: Partial<HookFact> = {}): HookFact {
  return {
    name: event,
    path: filePath,
    event,
    source: "cursor-hooks",
    sourceProvider: "cursor",
    schemaProfile: "cursor",
    ...extra,
  };
}

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
  errors: ConfigErrorFact[],
): HookFact[] {
  if (!existsSync(filePath)) {
    return [];
  }
  const raw = readJsonConfig(filePath, errors);
  if (raw === undefined) {
    return [];
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    errors.push({
      path: filePath,
      kind: "unexpected-shape",
      detail: "hooks.json is not a JSON object",
    });
    return [];
  }
  const hooks = (raw as Record<string, unknown>).hooks;
  if (hooks === undefined) {
    return [];
  }
  if (hooks === null || typeof hooks !== "object" || Array.isArray(hooks)) {
    errors.push({
      path: filePath,
      kind: "unexpected-shape",
      detail: "hooks is not a JSON object",
    });
    return [];
  }

  const facts: HookFact[] = [];
  for (const [event, value] of Object.entries(hooks as Record<string, unknown>)) {
    if (!Array.isArray(value)) {
      errors.push({
        path: filePath,
        kind: "unexpected-shape",
        detail: `${event} hook list is not an array`,
      });
      continue;
    }
    for (const item of value) {
      if (item === null || typeof item !== "object" || Array.isArray(item)) {
        facts.push(baseFact(event, filePath, { defect: "command-without-command" }));
        continue;
      }
      const rec = item as Record<string, unknown>;
      if (rec.type !== undefined) {
        const declared = typeof rec.type === "string" ? rec.type : undefined;
        if (declared === undefined || !CURSOR_HOOK_HANDLER_TYPES.has(declared)) {
          facts.push(
            baseFact(event, filePath, {
              defect: "unknown-handler-type",
              unknownHandlerType:
                declared ?? JSON.stringify(rec.type),
            }),
          );
          continue;
        }
      }
      // `command` is required for every entry, `type: "prompt"` included: the
      // options table marks it required with no per-type exception and
      // documents no separate `prompt` field.
      const command = typeof rec.command === "string" ? rec.command : undefined;
      if (command === undefined || command.length === 0) {
        facts.push(
          baseFact(event, filePath, {
            handlerType: "command",
            defect: "command-without-command",
          }),
        );
        continue;
      }
      const fact = baseFact(event, filePath, { handlerType: "command", command });
      const extracted = hookScriptPath(command);
      if (extracted === undefined) {
        facts.push(fact);
        continue;
      }
      // Quoted: project hooks "Run from the project root", and a relative
      // `./hooks/script.sh` really does resolve to `<project>/hooks/script.sh`.
      const abs = isAbsolute(extracted) ? extracted : join(projectRoot, extracted);
      facts.push({ ...fact, scriptPath: extracted, scriptExists: isFile(abs) });
    }
  }
  return facts;
}
