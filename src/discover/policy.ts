import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { PROJECT_SKILL_DIRS, providerHome } from "../facts/providers";
import type { Provider } from "../facts/provider";
import type { LockedSkillFact, PolicyFileFact } from "../facts/types";
import { NESTED_DISCOVERY_MAX_DEPTH, POLICY_CAP, walkFiles } from "./shared";
import { ancestorDirsInclusive, hops } from "./scan-context";
import { isFile, isRecord, readCapped, readConfigFile, type ScanIO } from "./fs";

function readPolicyFile(
  filePath: string,
  io: ScanIO,
  meta: {
    sourceProvider: Provider;
    kind: NonNullable<PolicyFileFact["kind"]>;
    startDir: string;
    hopsDir?: string;
  },
): PolicyFileFact | undefined {
  const result = readCapped(filePath, POLICY_CAP, io, { optional: true });
  if (result === undefined) {
    return undefined;
  }
  return {
    path: filePath,
    text: result.text,
    sourceProvider: meta.sourceProvider,
    kind: meta.kind,
    hopsFromStart: hops(meta.startDir, meta.hopsDir ?? dirname(filePath)),
  };
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
/**
 * Codex concatenates AGENTS.md / AGENTS.override.md from the project root
 * down to cwd and stops at `project_doc_max_bytes` (32 KiB). Nested files
 * that are not on that walk-up chain are not counted. CLAUDE.md is excluded.
 * See docs/spec/codex-agents-md.md.
 */
function isAgentsMdPolicy(policy: PolicyFileFact): boolean {
  if (policy.kind === "agents-md") {
    return true;
  }
  if (policy.kind !== undefined) {
    return false;
  }
  const name = basename(policy.path);
  return name === "AGENTS.md" || name === "AGENTS.override.md";
}

function nonempty(text: string): boolean {
  return text.trim().length > 0;
}

/**
 * Per directory Codex loads at most one file: non-empty AGENTS.override.md,
 * otherwise AGENTS.md, otherwise the first non-empty project_doc_fallback_filenames
 * entry. Empty files are skipped. See docs/spec/codex-agents-md.md.
 */
export function codexInstructionChain(
  files: PolicyFileFact[],
  startDir: string,
  codexRoot: string,
  fallbacks: string[],
): PolicyFileFact[] {
  const chainDirs = new Set(ancestorDirsInclusive(startDir, codexRoot).map((dir) => resolve(dir)));
  const onChain = files.filter((policy) => {
    if (!isAgentsMdPolicy(policy) && !isFallbackPolicy(policy, fallbacks)) {
      return false;
    }
    const dir = resolve(dirname(policy.path));
    if (basename(dir) === ".commandcode" && basename(policy.path) === "AGENTS.md") {
      return false;
    }
    return chainDirs.has(dir);
  });
  const byDir = new Map<string, PolicyFileFact[]>();
  for (const policy of onChain) {
    const dir = resolve(dirname(policy.path));
    const bucket = byDir.get(dir);
    if (bucket === undefined) {
      byDir.set(dir, [policy]);
    } else {
      bucket.push(policy);
    }
  }
  const effective: PolicyFileFact[] = [];
  for (const group of byDir.values()) {
    const pick = pickCodexFile(group, fallbacks);
    if (pick !== undefined) {
      effective.push(pick);
    }
  }
  return effective;
}

function isFallbackPolicy(policy: PolicyFileFact, fallbacks: string[]): boolean {
  if (fallbacks.length === 0) {
    return false;
  }
  return fallbacks.includes(basename(policy.path));
}

function pickCodexFile(group: PolicyFileFact[], fallbacks: string[]): PolicyFileFact | undefined {
  const override = group.find((policy) => basename(policy.path) === "AGENTS.override.md");
  if (override !== undefined && nonempty(override.text)) {
    return override;
  }
  const normal = group.find((policy) => basename(policy.path) === "AGENTS.md");
  if (normal !== undefined && nonempty(normal.text)) {
    return normal;
  }
  for (const name of fallbacks) {
    const fallback = group.find((policy) => basename(policy.path) === name);
    if (fallback !== undefined && nonempty(fallback.text)) {
      return fallback;
    }
  }
  return undefined;
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
  io: ScanIO,
  startDir = root,
  includeGlobal = false,
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
      readPolicyFile(join(root, rel), io, { sourceProvider, kind, startDir: start }),
    );
  }

  for (const dir of ancestorDirsInclusive(start, root)) {
    addUnique(
      out,
      seen,
      readPolicyFile(join(dir, "AGENTS.md"), io, {
        sourceProvider: "unknown",
        kind: "agents-md",
        startDir: start,
      }),
    );
    addUnique(
      out,
      seen,
      readPolicyFile(join(dir, "agents.md"), io, {
        sourceProvider: "unknown",
        kind: "agents-md",
        startDir: start,
      }),
    );
    addUnique(
      out,
      seen,
      readPolicyFile(join(dir, "Agents.md"), io, {
        sourceProvider: "grok",
        kind: "agents-md",
        startDir: start,
      }),
    );
    addUnique(
      out,
      seen,
      readPolicyFile(join(dir, "AGENT.md"), io, {
        sourceProvider: "grok",
        kind: "agents-md",
        startDir: start,
      }),
    );
    if (!existsSync(join(dir, "AGENTS.md"))) {
      addUnique(
        out,
        seen,
        readPolicyFile(join(dir, ".commandcode", "AGENTS.md"), io, {
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
      readPolicyFile(join(dir, "AGENTS.override.md"), io, {
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
        readPolicyFile(join(dir, name), io, {
          sourceProvider: "codex",
          kind: "agents-md",
          startDir: start,
        }),
      );
    }
    addUnique(
      out,
      seen,
      readPolicyFile(join(dir, "CLAUDE.md"), io, {
        sourceProvider: "claude",
        kind: "claude-md",
        startDir: start,
      }),
    );
    addUnique(
      out,
      seen,
      readPolicyFile(join(dir, ".claude", "CLAUDE.md"), io, {
        sourceProvider: "claude",
        kind: "claude-md",
        startDir: start,
      }),
    );
    addUnique(
      out,
      seen,
      readPolicyFile(join(dir, "CLAUDE.local.md"), io, {
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
    io,
  })) {
    const commandcodeMemory = isCommandcodeMemoryFallback(abs);
    addUnique(
      out,
      seen,
      readPolicyFile(abs, io, {
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
    readPolicyFile(join(root, ".github", "copilot-instructions.md"), io, {
      sourceProvider: "vscode",
      kind: "vscode-instructions",
      startDir: start,
    }),
  );
  const instructionsDir = join(root, ".github", "instructions");
  for (const abs of walkFiles(instructionsDir, {
    maxDepth: NESTED_DISCOVERY_MAX_DEPTH,
    match: (_abs, name) => name.endsWith(".instructions.md"),
    io,
  })) {
    addUnique(
      out,
      seen,
      readPolicyFile(abs, io, {
        sourceProvider: "vscode",
        kind: "vscode-instructions",
        startDir: start,
      }),
    );
  }

  if (includeGlobal) {
    addUnique(
      out,
      seen,
      readPolicyFile(join(providerHome("codex"), "AGENTS.override.md"), io, {
        sourceProvider: "codex",
        kind: "agents-md",
        startDir: start,
      }),
    );
    addUnique(
      out,
      seen,
      readPolicyFile(join(providerHome("codex"), "AGENTS.md"), io, {
        sourceProvider: "codex",
        kind: "agents-md",
        startDir: start,
      }),
    );
    addUnique(
      out,
      seen,
      readPolicyFile(join(providerHome("commandcode"), "AGENTS.md"), io, {
        sourceProvider: "commandcode",
        kind: "agents-md",
        startDir: start,
      }),
    );
    addUnique(
      out,
      seen,
      readPolicyFile(join(providerHome("claude"), "CLAUDE.md"), io, {
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
  /** Path is not a file. Distinct from `invalid`: a missing lock is not present. */
  missing?: boolean;
};

function parseSkillsLockFile(
  filePath: string,
  io: ScanIO,
): ParsedLock {
  const raw = readConfigFile(filePath, io, { optional: true });
  if (raw === undefined) {
    const failed = io.errors.some((err) => err.path === filePath);
    return failed ? { entries: [], invalid: true } : { entries: [], missing: true };
  }
  if (!isRecord(raw)) {
    io.errors.push({
      path: filePath,
      kind: "unexpected-shape",
      detail: "skills-lock.json is not a JSON object",
    });
    return { entries: [], invalid: true };
  }
  const skills = (raw as Record<string, unknown>).skills;
  if (!isRecord(skills)) {
    io.errors.push({
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
    // A lock in a dot-dir worktree (`.worktrees/x/`) sits where the skill walk
    // does not go; its own directory is the only base that names its installs.
    if (PROJECT_SKILL_DIRS.some((dir) => isFile(join(lockRoot, dir, id, "SKILL.md")))) {
      entry.installedBesideLock = true;
    }
    if (isRecord(value)) {
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
  io: ScanIO,
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
    if (seen.has(resolved)) {
      return;
    }
    seen.add(resolved);
    const parsed = parseSkillsLockFile(resolved, io);
    if (parsed.missing === true) {
      return;
    }
    present = true;
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
    io,
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
