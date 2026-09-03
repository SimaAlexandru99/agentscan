import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { claudeConfigDir } from "../facts/claude";
import type { Provider } from "../facts/provider";
import type { ConfigErrorFact, LockedSkillFact, PolicyFileFact } from "../facts/types";
import {
  ancestorDirsInclusive,
  hopsFrom,
  NESTED_DISCOVERY_MAX_DEPTH,
  POLICY_CAP,
  readCapped,
  readJsonConfig,
  walkFiles,
} from "./shared";

function readPolicyFile(
  filePath: string,
  errors: ConfigErrorFact[],
  meta: {
    sourceProvider: Provider;
    kind: NonNullable<PolicyFileFact["kind"]>;
    startDir: string;
    hopsDir?: string;
  },
): PolicyFileFact | undefined {
  if (!existsSync(filePath)) {
    return undefined;
  }
  try {
    const result = readCapped(filePath, POLICY_CAP);
    const text = result.buf.subarray(0, POLICY_CAP).toString("utf8");
    if (result.truncated) {
      errors.push({
        path: filePath,
        kind: "truncated",
        detail: `file exceeds ${POLICY_CAP} byte scan cap`,
      });
    }
    return {
      path: filePath,
      text,
      sourceProvider: meta.sourceProvider,
      kind: meta.kind,
      hopsFromStart: hopsFrom(meta.startDir, meta.hopsDir ?? dirname(filePath)),
    };
  } catch (err) {
    errors.push({
      path: filePath,
      kind: "unreadable",
      detail: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

function addUnique(
  out: PolicyFileFact[],
  seen: Set<string>,
  fact: PolicyFileFact | undefined,
): void {
  if (fact === undefined) {
    return;
  }
  const key = resolve(fact.path);
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  out.push(fact);
}

export function resolveCodexProjectRoot(
  startDir: string,
  scanBoundary: string,
  markers: string[] | undefined,
): string {
  const start = resolve(startDir);
  const boundary = resolve(scanBoundary);
  if (markers !== undefined && markers.length === 0) {
    return start;
  }
  const names = markers ?? [".git"];
  for (const dir of ancestorDirsInclusive(start, boundary)) {
    if (names.some((name) => existsSync(join(dir, name)))) {
      return dir;
    }
  }
  return boundary;
}
function isCommandcodeMemoryFallback(abs: string): boolean {
  return basename(abs) === "AGENTS.md" && basename(dirname(abs)) === ".commandcode";
}

/**
 * Instruction files: configured names, walk-up CLAUDE.md / AGENTS.md, nested
 * AGENTS.md, and VS Code instruction files. See docs/spec/agents-md.md,
 * docs/spec/claude-memory.md, docs/spec/vscode-instructions.md,
 * docs/spec/commandcode-memory.md.
 *
 * Command Code memory per directory is the first existing of `AGENTS.md` or
 * `.commandcode/AGENTS.md`, including nested `<dir>/.commandcode/AGENTS.md`.
 */
export function discoverPolicyFiles(
  root: string,
  policyFiles: string[],
  errors: ConfigErrorFact[],
  startDir = root,
  includeGlobal = false,
  _commandcodeProjectRoot = root,
  fallbackFilenames: string[] = [],
): PolicyFileFact[] {
  const out: PolicyFileFact[] = [];
  const seen = new Set<string>();
  const start = resolve(startDir);

  for (const rel of policyFiles) {
    const kind =
      basename(rel) === "CLAUDE.md" || basename(rel) === "CLAUDE.local.md"
        ? "claude-md"
        : basename(rel).endsWith(".instructions.md") ||
            basename(rel) === "copilot-instructions.md"
          ? "vscode-instructions"
          : "agents-md";
    const sourceProvider: Provider =
      kind === "claude-md" ? "claude" : kind === "vscode-instructions" ? "vscode" : "unknown";
    addUnique(
      out,
      seen,
      readPolicyFile(join(root, rel), errors, { sourceProvider, kind, startDir: start }),
    );
  }

  for (const dir of ancestorDirsInclusive(start, root)) {
    addUnique(
      out,
      seen,
      readPolicyFile(join(dir, "AGENTS.md"), errors, {
        sourceProvider: "unknown",
        kind: "agents-md",
        startDir: start,
      }),
    );
    addUnique(
      out,
      seen,
      readPolicyFile(join(dir, "agents.md"), errors, {
        sourceProvider: "unknown",
        kind: "agents-md",
        startDir: start,
      }),
    );
    addUnique(
      out,
      seen,
      readPolicyFile(join(dir, "Agents.md"), errors, {
        sourceProvider: "grok",
        kind: "agents-md",
        startDir: start,
      }),
    );
    addUnique(
      out,
      seen,
      readPolicyFile(join(dir, "AGENT.md"), errors, {
        sourceProvider: "grok",
        kind: "agents-md",
        startDir: start,
      }),
    );
    if (!existsSync(join(dir, "AGENTS.md"))) {
      addUnique(
        out,
        seen,
        readPolicyFile(join(dir, ".commandcode", "AGENTS.md"), errors, {
          sourceProvider: "commandcode",
          kind: "agents-md",
          startDir: start,
          hopsDir: dir,
        }),
      );
    }
    addUnique(
      out,
      seen,
      readPolicyFile(join(dir, "AGENTS.override.md"), errors, {
        sourceProvider: "codex",
        kind: "agents-md",
        startDir: start,
      }),
    );
    for (const name of fallbackFilenames) {
      if (name === "AGENTS.md" || name === "AGENTS.override.md" || basename(name) !== name) {
        continue;
      }
      addUnique(
        out,
        seen,
        readPolicyFile(join(dir, name), errors, {
          sourceProvider: "codex",
          kind: "agents-md",
          startDir: start,
        }),
      );
    }
    addUnique(
      out,
      seen,
      readPolicyFile(join(dir, "CLAUDE.md"), errors, {
        sourceProvider: "claude",
        kind: "claude-md",
        startDir: start,
      }),
    );
    addUnique(
      out,
      seen,
      readPolicyFile(join(dir, ".claude", "CLAUDE.md"), errors, {
        sourceProvider: "claude",
        kind: "claude-md",
        startDir: start,
      }),
    );
    addUnique(
      out,
      seen,
      readPolicyFile(join(dir, "CLAUDE.local.md"), errors, {
        sourceProvider: "claude",
        kind: "claude-md",
        startDir: start,
      }),
    );
  }

  for (const abs of walkFiles(root, {
    maxDepth: NESTED_DISCOVERY_MAX_DEPTH,
    match: (abs, name) => {
      if (
        name === "AGENTS.override.md" ||
        name === "Agents.md" ||
        name === "AGENT.md" ||
        name === "agents.md"
      ) {
        return true;
      }
      if (name !== "AGENTS.md") {
        return false;
      }
      if (basename(dirname(abs)) === ".commandcode") {
        return !existsSync(join(dirname(dirname(abs)), "AGENTS.md"));
      }
      return true;
    },
    errors,
  })) {
    const commandcodeMemory = isCommandcodeMemoryFallback(abs);
    addUnique(
      out,
      seen,
      readPolicyFile(abs, errors, {
        sourceProvider: commandcodeMemory
          ? "commandcode"
          : basename(abs) === "AGENTS.override.md"
            ? "codex"
            : basename(abs) === "Agents.md" || basename(abs) === "AGENT.md"
              ? "grok"
              : "unknown",
        kind: "agents-md",
        startDir: start,
        ...(commandcodeMemory ? { hopsDir: dirname(dirname(abs)) } : {}),
      }),
    );
  }

  addUnique(
    out,
    seen,
    readPolicyFile(join(root, ".github", "copilot-instructions.md"), errors, {
      sourceProvider: "vscode",
      kind: "vscode-instructions",
      startDir: start,
    }),
  );
  const instructionsDir = join(root, ".github", "instructions");
  if (existsSync(instructionsDir)) {
    for (const abs of walkFiles(instructionsDir, {
      maxDepth: NESTED_DISCOVERY_MAX_DEPTH,
      match: (_abs, name) => name.endsWith(".instructions.md"),
      errors,
    })) {
      addUnique(
        out,
        seen,
        readPolicyFile(abs, errors, {
          sourceProvider: "vscode",
          kind: "vscode-instructions",
          startDir: start,
        }),
      );
    }
  }

  if (includeGlobal) {
    addUnique(
      out,
      seen,
      readPolicyFile(join(homedir(), ".codex", "AGENTS.override.md"), errors, {
        sourceProvider: "codex",
        kind: "agents-md",
        startDir: start,
      }),
    );
    addUnique(
      out,
      seen,
      readPolicyFile(join(homedir(), ".codex", "AGENTS.md"), errors, {
        sourceProvider: "codex",
        kind: "agents-md",
        startDir: start,
      }),
    );
    addUnique(
      out,
      seen,
      readPolicyFile(join(homedir(), ".commandcode", "AGENTS.md"), errors, {
        sourceProvider: "commandcode",
        kind: "agents-md",
        startDir: start,
      }),
    );
    addUnique(
      out,
      seen,
      readPolicyFile(join(claudeConfigDir(), "CLAUDE.md"), errors, {
        sourceProvider: "claude",
        kind: "claude-md",
        startDir: start,
      }),
    );
  }

  const agentsMd = out.filter((f) => f.kind === "agents-md");
  const onChain = agentsMd.filter(
    (f) => Number.isFinite(f.hopsFromStart ?? Number.POSITIVE_INFINITY),
  );
  if (onChain.length > 0) {
    const nearestHops = Math.min(
      ...onChain.map((f) => f.hopsFromStart ?? Number.POSITIVE_INFINITY),
    );
    for (const fact of onChain) {
      if ((fact.hopsFromStart ?? Number.POSITIVE_INFINITY) === nearestHops) {
        fact.nearest = true;
      }
    }
  }

  return out;
}

type ParsedLock = {
  entries: LockedSkillFact[];
  invalid?: boolean;
};

function parseSkillsLockFile(
  filePath: string,
  errors: ConfigErrorFact[],
): ParsedLock {
  const raw = readJsonConfig(filePath, errors);
  if (raw === undefined) {
    return { entries: [], invalid: true };
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    errors.push({
      path: filePath,
      kind: "unexpected-shape",
      detail: "skills-lock.json is not a JSON object",
    });
    return { entries: [], invalid: true };
  }
  const skills = (raw as Record<string, unknown>).skills;
  if (skills === null || typeof skills !== "object" || Array.isArray(skills)) {
    errors.push({
      path: filePath,
      kind: "unexpected-shape",
      detail: "skills-lock.json has no `skills` object",
    });
    return { entries: [], invalid: true };
  }

  const lockRoot = dirname(resolve(filePath));
  const locked: LockedSkillFact[] = [];
  for (const [id, value] of Object.entries(skills as Record<string, unknown>)) {
    const entry: LockedSkillFact = { id, lockRoot, lockPath: filePath };
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const v = value as Record<string, unknown>;
      if (typeof v.source === "string") {
        entry.source = v.source;
      }
      if (typeof v.skillPath === "string") {
        entry.skillPath = v.skillPath;
      }
      if (typeof v.computedHash === "string") {
        entry.computedHash = v.computedHash;
      }
    }
    locked.push(entry);
  }
  return { entries: locked };
}

/**
 * skills-lock.json — the oracle for which skills are managed installs pinned to
 * an upstream source, and which are local and unpinned. One lockfile governs
 * the skills under its directory; a monorepo may have several.
 */
export function discoverSkillsLocks(
  scanBoundary: string,
  projectRoot: string,
  errors: ConfigErrorFact[],
): {
  locked: LockedSkillFact[];
  present: boolean;
  invalid?: boolean;
  lockRoots: string[];
} {
  const seen = new Set<string>();
  const locked: LockedSkillFact[] = [];
  const lockRoots: string[] = [];
  let present = false;
  let validCount = 0;

  const consider = (filePath: string): void => {
    const resolved = resolve(filePath);
    if (seen.has(resolved) || !existsSync(resolved)) {
      return;
    }
    seen.add(resolved);
    present = true;
    const parsed = parseSkillsLockFile(resolved, errors);
    if (parsed.invalid === true) {
      return;
    }
    validCount += 1;
    lockRoots.push(dirname(resolved));
    locked.push(...parsed.entries);
  };

  consider(join(projectRoot, "skills-lock.json"));
  for (const abs of walkFiles(scanBoundary, {
    maxDepth: NESTED_DISCOVERY_MAX_DEPTH,
    match: (_abs, name) => name === "skills-lock.json",
    errors,
  })) {
    consider(abs);
  }

  return {
    locked,
    present,
    lockRoots,
    ...(present && validCount === 0 ? { invalid: true } : {}),
  };
}

export function discoverSkillsLock(
  root: string,
  errors: ConfigErrorFact[],
): { locked: LockedSkillFact[]; present: boolean; invalid?: boolean } {
  const found = discoverSkillsLocks(root, root, errors);
  return {
    locked: found.locked,
    present: found.present,
    ...(found.invalid === undefined ? {} : { invalid: found.invalid }),
  };
}
