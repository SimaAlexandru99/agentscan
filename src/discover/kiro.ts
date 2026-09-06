import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { KIRO_HOOK_HANDLER_TYPES } from "../facts/kiro";
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

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function baseFact(event: string, filePath: string, extra: Partial<HookFact> = {}): HookFact {
  return {
    name: event,
    path: filePath,
    event,
    source: "kiro-hooks",
    sourceProvider: "kiro",
    schemaProfile: "kiro",
    ...extra,
  };
}

/**
 * Quoted global hooks dir. Only opened under `--global`.
 * See docs/spec/kiro-hooks.md.
 */
export function kiroUserHooksDir(home = homedir()): string {
  return join(home, ".kiro", "hooks");
}

/** Quoted global skills dir. Only opened under `--global`. */
export function kiroUserSkillsPath(home = homedir()): string {
  return join(home, ".kiro", "skills");
}

/**
 * Standalone `.kiro/hooks/*.json` files. Array-of-hooks shape, not Claude's
 * event-keyed object. See docs/spec/kiro-hooks.md.
 */
export function discoverKiroHooksDir(
  dir: string,
  projectRoot: string,
  errors: ConfigErrorFact[],
): HookFact[] {
  if (!existsSync(dir) || !isDir(dir)) {
    return [];
  }
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch (err) {
    errors.push({
      path: dir,
      kind: "unreadable",
      detail: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
  const facts: HookFact[] = [];
  for (const name of names) {
    if (!name.endsWith(".json") || name.startsWith(".")) {
      continue;
    }
    facts.push(...discoverKiroHooksFile(join(dir, name), projectRoot, errors));
  }
  return facts;
}

export function discoverKiroHooksFile(
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
      detail: "Kiro hook file is not a JSON object",
    });
    return [];
  }
  const obj = raw as Record<string, unknown>;
  const versionOk = obj.version === "v1";
  const hooks = obj.hooks;
  if (!versionOk || !Array.isArray(hooks)) {
    const kiroInvalidGroup = !versionOk && !Array.isArray(hooks)
      ? "missing-version-and-hooks"
      : !versionOk
        ? "missing-version"
        : "missing-hooks";
    return [baseFact("(file)", filePath, { defect: "invalid-group", kiroInvalidGroup })];
  }

  const facts: HookFact[] = [];
  for (const item of hooks) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      facts.push(
        baseFact("(entry)", filePath, { defect: "invalid-group", kiroInvalidGroup: "entry" }),
      );
      continue;
    }
    const rec = item as Record<string, unknown>;
    if (rec.enabled === false) {
      continue;
    }
    const event = typeof rec.trigger === "string" ? rec.trigger : "(missing)";
    const action =
      rec.action !== null && typeof rec.action === "object" && !Array.isArray(rec.action)
        ? (rec.action as Record<string, unknown>)
        : undefined;
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
    if (command === undefined || command.length === 0) {
      facts.push(
        baseFact(event, filePath, { handlerType: "command", defect: "command-without-command" }),
      );
      continue;
    }
    const fact = baseFact(event, filePath, { handlerType: "command", command });
    const extracted = hookScriptPath(command);
    if (extracted === undefined) {
      facts.push(fact);
      continue;
    }
    const abs = isAbsolute(extracted) ? extracted : join(projectRoot, extracted);
    facts.push({ ...fact, scriptPath: extracted, scriptExists: isFile(abs) });
  }
  return facts;
}
