import { KIRO_HOOK_HANDLER_TYPES } from "../facts/kiro";
import type { HookFact } from "../facts/types";
import { commandHook, hookBase, hookJsonFiles, readHooksDocument } from "./hooks";
import { isRecord, type ScanIO } from "./fs";

const baseFact = hookBase("kiro");

/**
 * Standalone `.kiro/hooks/*.json` files. Array-of-hooks shape, not Claude's
 * event-keyed object. See docs/spec/kiro-hooks.md.
 */
export function discoverKiroHooksDir(
  dir: string,
  projectRoot: string,
  io: ScanIO,
): HookFact[] {
  return hookJsonFiles(dir, io).flatMap((filePath) =>
    discoverKiroHooksFile(filePath, projectRoot, io),
  );
}

function discoverKiroHooksFile(
  filePath: string,
  projectRoot: string,
  io: ScanIO,
): HookFact[] {
  const obj = readHooksDocument(filePath, io);
  if (obj === undefined) {
    return [];
  }
  const versionOk = obj.version === "v1";
  const hooks = obj.hooks;
  if (!versionOk || !Array.isArray(hooks)) {
    const defectDetail = !versionOk && !Array.isArray(hooks)
      ? "missing-version-and-hooks"
      : !versionOk
        ? "missing-version"
        : "missing-hooks";
    return [baseFact("(file)", filePath, { defect: "invalid-group", defectDetail })];
  }

  const facts: HookFact[] = [];
  for (const item of hooks) {
    if (!isRecord(item)) {
      facts.push(
        baseFact("(entry)", filePath, { defect: "invalid-group", defectDetail: "entry" }),
      );
      continue;
    }
    const rec = item;
    if (rec.enabled === false) {
      continue;
    }
    const event = typeof rec.trigger === "string" ? rec.trigger : "(missing)";
    const action = isRecord(rec.action) ? rec.action : undefined;
    const declared = typeof action?.type === "string" ? action.type : undefined;
    if (action === undefined || declared === undefined || !KIRO_HOOK_HANDLER_TYPES.has(declared)) {
      facts.push(
        baseFact(event, filePath, {
          defect: "unknown-handler-type",
          unknownHandlerType: declared ?? (action === undefined ? "(missing)" : JSON.stringify(action.type)),
        }),
      );
      continue;
    }
    if (declared === "agent") {
      const prompt = typeof action.prompt === "string" ? action.prompt : undefined;
      if (prompt === undefined || prompt.length === 0) {
        facts.push(baseFact(event, filePath, { handlerType: "agent", defect: "prompt-without-prompt" }));
        continue;
      }
      facts.push(baseFact(event, filePath, { handlerType: "agent" }));
      continue;
    }
    const command = typeof action.command === "string" ? action.command : undefined;
    facts.push(commandHook(baseFact(event, filePath), command, projectRoot));
  }
  return facts;
}
