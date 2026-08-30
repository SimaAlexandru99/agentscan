import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
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
      hopsFromStart: hopsFrom(meta.startDir, dirname(filePath)),
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

/**
 * Instruction files: configured names, walk-up CLAUDE.md / AGENTS.md, nested
 * AGENTS.md, and VS Code instruction files. See docs/spec/agents-md.md,
 * docs/spec/claude-memory.md, docs/spec/vscode-instructions.md.
 */
export function discoverPolicyFiles(
  root: string,
  policyFiles: string[],
  errors: ConfigErrorFact[],
  startDir = root,
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
      readPolicyFile(join(dir, "AGENTS.override.md"), errors, {
        sourceProvider: "codex",
        kind: "agents-md",
        startDir: start,
      }),
    );
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
    match: (_abs, name) => name === "AGENTS.md" || name === "AGENTS.override.md",
    errors,
  })) {
    addUnique(
      out,
      seen,
      readPolicyFile(abs, errors, {
        sourceProvider: basename(abs) === "AGENTS.override.md" ? "codex" : "unknown",
        kind: "agents-md",
        startDir: start,
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

/**
 * skills-lock.json — the oracle for which skills are managed installs pinned to
 * an upstream source, and which are local and unpinned.
 */
export function discoverSkillsLock(
  root: string,
  errors: ConfigErrorFact[],
): { locked: LockedSkillFact[]; present: boolean; invalid?: boolean } {
  const filePath = join(root, "skills-lock.json");
  if (!existsSync(filePath)) {
    return { locked: [], present: false };
  }
  const raw = readJsonConfig(filePath, errors);
  if (raw === undefined) {
    return { locked: [], present: true, invalid: true };
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    errors.push({
      path: filePath,
      kind: "unexpected-shape",
      detail: "skills-lock.json is not a JSON object",
    });
    return { locked: [], present: true, invalid: true };
  }
  const skills = (raw as Record<string, unknown>).skills;
  if (skills === null || typeof skills !== "object" || Array.isArray(skills)) {
    errors.push({
      path: filePath,
      kind: "unexpected-shape",
      detail: "skills-lock.json has no `skills` object",
    });
    return { locked: [], present: true, invalid: true };
  }

  const locked: LockedSkillFact[] = [];
  for (const [id, value] of Object.entries(skills as Record<string, unknown>)) {
    const entry: LockedSkillFact = { id };
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
  return { locked, present: true };
}
