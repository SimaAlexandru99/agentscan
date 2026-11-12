import type { HookFact } from "../facts/types";
import { commandHook, hookBase, readHooksDocument } from "./hooks";
import { isRecord, type ScanIO } from "./fs";

const make = hookBase("antigravity");

/**
 * One `.agents/hooks.json` or `~/.gemini/config/hooks.json`.
 * Hook names are not events. `enabled: false` drops the whole definition.
 * See docs/spec/antigravity-hooks.md.
 */
export function discoverAntigravityHooksFile(
  filePath: string,
  projectRoot: string,
  io: ScanIO,
): HookFact[] {
  const doc = readHooksDocument(filePath, io);
  if (doc === undefined) {
    return [];
  }
  const facts: HookFact[] = [];
  for (const [name, definition] of Object.entries(doc)) {
    if (!isRecord(definition)) {
      io.errors.push({
        path: filePath,
        kind: "unexpected-shape",
        detail: `${name} hook definition is not an object`,
      });
      continue;
    }
    if ("enabled" in definition && typeof definition.enabled !== "boolean") {
      io.errors.push({
        path: filePath,
        kind: "unexpected-shape",
        detail: `${name} enabled is not a boolean`,
      });
    }
    if (definition.enabled === false) {
      continue;
    }
    for (const [key, value] of Object.entries(definition)) {
      if (key === "enabled") {
        continue;
      }
      if (!Array.isArray(value)) {
        io.errors.push({
          path: filePath,
          kind: "unexpected-shape",
          detail: `${name}.${key} is not an array`,
        });
        continue;
      }
      for (const item of value) {
        facts.push(...itemsFromEvent(key, item, filePath, projectRoot));
      }
    }
  }
  return facts;
}

function itemsFromEvent(
  event: string,
  item: unknown,
  filePath: string,
  projectRoot: string,
): HookFact[] {
  if (!isRecord(item)) {
    return [make(event, filePath, { defect: "invalid-group" })];
  }
  if ("hooks" in item || "matcher" in item) {
    return groupFacts(event, item, filePath, projectRoot);
  }
  return [handlerFact(event, item, filePath, projectRoot)];
}

function groupFacts(
  event: string,
  group: Record<string, unknown>,
  filePath: string,
  projectRoot: string,
): HookFact[] {
  const facts: HookFact[] = [];
  if ("matcher" in group && typeof group.matcher !== "string") {
    facts.push(make(event, filePath, { defect: "invalid-group", defectDetail: "matcher-not-string" }));
  }
  if (!Array.isArray(group.hooks) || group.hooks.length === 0) {
    facts.push(make(event, filePath, { defect: "invalid-group" }));
    return facts;
  }
  for (const handler of group.hooks) {
    if (!isRecord(handler)) {
      facts.push(make(event, filePath, { defect: "invalid-group" }));
      continue;
    }
    facts.push(handlerFact(event, handler, filePath, projectRoot));
  }
  return facts;
}

function handlerFact(
  event: string,
  item: Record<string, unknown>,
  filePath: string,
  projectRoot: string,
): HookFact {
  if ("type" in item && item.type !== undefined && item.type !== "command") {
    return make(event, filePath, {
      defect: "unknown-handler-type",
      unknownHandlerType: typeof item.type === "string" ? item.type : JSON.stringify(item.type),
    });
  }
  const command = typeof item.command === "string" && item.command.length > 0 ? item.command : undefined;
  return commandHook(make(event, filePath), command, projectRoot);
}
