import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { AgentscanConfig } from "../config/schema";
import type {
  AgentFact,
  ConfigErrorFact,
  HookFact,
  LockedSkillFact,
  McpFact,
  SkillFact,
} from "../facts/types";

const POLICY_CAP = 100_000;
// The body is read now, not just the frontmatter, so 8 KB truncated most real
// skills mid-document. Still capped: this reads every skill in the tree.
const SKILL_MD_CAP = 65_536;

function readCapped(path: string, cap: number): { buf: Buffer; truncated: boolean } {
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.allocUnsafe(cap + 1);
    const bytes = readSync(fd, buf, 0, cap + 1, 0);
    return { buf: buf.subarray(0, bytes), truncated: bytes > cap };
  } finally { closeSync(fd); }
}

export type AgentSurface = {
  skills: SkillFact[];
  agents: AgentFact[];
  hooks: HookFact[];
  mcp: McpFact[];
  policyFiles: { path: string; text: string }[];
  lockedSkills: LockedSkillFact[];
  hasSkillsLock: boolean;
  skillsLockInvalid?: boolean;
  configErrors: ConfigErrorFact[];
};

/** Walk up from startDir for nearest package.json; throw if none. */
export function resolveRoot(startDir: string): string {
  let dir = resolve(startDir);
  for (;;) {
    if (existsSync(join(dir, "package.json"))) {
      return dir;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) {
      throw new Error(
        `No package.json found walking up from ${resolve(startDir)}`,
      );
    }
    dir = parent;
  }
}

/**
 * Read a JSON config. A malformed file is a config issue — the thing this tool
 * exists to report — so it is recorded rather than skipped.
 */
function readJsonConfig(
  path: string,
  errors: ConfigErrorFact[],
): unknown | undefined {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    errors.push({
      path,
      kind: "unreadable",
      detail: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (err) {
    errors.push({
      path,
      kind: "invalid-json",
      detail: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

type Frontmatter = {
  hasFrontmatter: boolean;
  /** Everything after the closing fence. */
  body?: string;
  /** The block exists but the parser rejected it — fields are unknown, absent. */
  unparseable?: boolean;
  /** Read failed — say so rather than claiming the file has no frontmatter. */
  unreadable?: boolean;
  name?: string;
  description?: string;
};

/**
 * Bundled files a SKILL.md body points at, under the conventional directories
 * a skill ships supporting files in.
 *
 * The lookbehind rejects a path nested under something else
 * (`packages/web/references/x.md`) and any URL (`https://host/scripts/x.md`).
 */
const BUNDLED = "scripts|references|assets|templates|examples";
const REFERENCE_RE = new RegExp(
  // `./` is an accepted prefix; anything else before the directory name means
  // the path belongs to something other than this skill.
  `(?<![\\w/.-])(?:\\./)?((?:${BUNDLED})/[A-Za-z0-9_./-]+\\.[A-Za-z0-9]{1,10})(?![A-Za-z0-9_.-])`,
  "g",
);

/**
 * Code-block fences, anchored to line start.
 *
 * Three or more backticks or tildes, per CommonMark. The previous version
 * matched an unanchored ``` anywhere, so a mid-line backtick run swallowed the
 * rest of the document and hid real references; and it knew nothing of `~~~` or
 * four-backtick fences, so examples inside those were reported as broken.
 */
const FENCE_BLOCK = /^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^[ \t]*\1[ \t]*$|$)/gm;
/** Inline code may point at a bundled file; ordinary prose remains ignored. */
const INLINE_CODE = /`[^`\n]*`/g;
/** A URL swallows any path inside it, including one in a query string. */
const URLS = /\b[a-z][a-z0-9+.-]*:\/\/\S+/gi;

/**
 * Bundled files a SKILL.md body points at.
 *
 * Conservative on purpose: a wrong "this skill points at a missing file" costs
 * the reader more than a missed one. Fenced code blocks are stripped first —
 * paths in them illustrate usage rather than pointing anywhere.
 */
export function skillReferences(body: string): string[] {
  const prose = body
    .replace(FENCE_BLOCK, "")
    .replace(INLINE_CODE, (code) => /(?:scripts|references|assets|templates|examples)\/[A-Za-z0-9_./-]+\.[A-Za-z0-9]{1,10}/.test(code) ? code : "")
    .replace(URLS, "");
  const out: string[] = [];
  const seen = new Set<string>();
  for (const match of prose.matchAll(REFERENCE_RE)) {
    const path = match[1];
    if (path === undefined || seen.has(path)) {
      continue;
    }
    seen.add(path);
    out.push(path);
  }
  return out;
}

function scalar(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

/**
 * Parse the `---` block with a real YAML parser.
 *
 * This was regex-based, and every fix uncovered another shape it read wrong: an
 * empty `name:` captured the following line, and folded scalars (`description: >`
 * with the text indented beneath) recorded ">" as the value. Tightening the
 * regex only converted a wrong value into a wrong "field is missing" — the file
 * is valid YAML and the description is right there. `yaml` is already a
 * dependency for the rule loader, so this costs nothing new.
 */
function readFrontmatter(
  skillMdPath: string,
  errors: ConfigErrorFact[],
): Frontmatter {
  let text: string;
  let truncated = false;
  try {
    const result = readCapped(skillMdPath, SKILL_MD_CAP);
    truncated = result.truncated;
    text = result.buf.subarray(0, SKILL_MD_CAP).toString("utf8");
    // Several Windows editors write a BOM; without stripping it the `---` test
    // fails and a valid file is reported as having no frontmatter.
    if (text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1);
    }
    // CRLF is valid in a SKILL.md, but the closing fence is then "\r\n---" and
    // searching for "\n---" cuts inside it, leaving a stray \r that a strict
    // YAML parser rejects. Normalise before locating the fence.
    text = text.replace(/\r\n/g, "\n");
    if (truncated) {
      errors.push({ path: skillMdPath, kind: "unexpected-shape", detail: `file exceeds ${SKILL_MD_CAP} byte scan cap` });
      return { hasFrontmatter: true, unparseable: true };
    }
  } catch (err) {
    errors.push({
      path: skillMdPath,
      kind: "unreadable",
      detail: err instanceof Error ? err.message : String(err),
    });
    return { hasFrontmatter: false, unreadable: true };
  }
  if (!text.startsWith("---")) {
    return { hasFrontmatter: false };
  }
  // The closing fence is a line that is exactly `---` (YAML also allows `...`).
  // Matching a bare "\n---" prefix took a key named `---metadata` for the fence
  // and truncated the block, so a valid `description:` below it read as absent.
  const fence = /\n(?:---|\.\.\.)[ \t]*(?:\n|$)/.exec(text.slice(3));
  if (fence === null) {
    if (truncated) {
      // The block may well be well-formed past the cap; saying it has no
      // frontmatter is a claim about bytes we chose not to read.
      errors.push({
        path: skillMdPath,
        kind: "unexpected-shape",
        detail: `frontmatter not closed within the first ${SKILL_MD_CAP} bytes`,
      });
      return { hasFrontmatter: true, unparseable: true };
    }
    return { hasFrontmatter: false };
  }
  const end = 3 + fence.index;

  let block: unknown;
  try {
    block = parseYaml(text.slice(3, end)) as unknown;
  } catch (err) {
    // The block exists but the parser rejected it. Claiming "no name" here
    // would be a statement about a file we failed to read — the same false
    // message this parser was rewritten to stop producing. Say what is true:
    // the frontmatter is unparseable.
    errors.push({
      path: skillMdPath,
      kind: "unexpected-shape",
      detail: `frontmatter is not valid YAML: ${
        err instanceof Error ? err.message.split("\n")[0] : String(err)
      }`,
    });
    return { hasFrontmatter: true, unparseable: true };
  }
  if (block === null || typeof block !== "object" || Array.isArray(block)) {
    errors.push({
      path: skillMdPath,
      kind: "unexpected-shape",
      detail: "frontmatter is not a YAML mapping",
    });
    return { hasFrontmatter: true, unparseable: true };
  }

  const record = block as Record<string, unknown>;
  const out: Frontmatter = { hasFrontmatter: true, body: text.slice(end + 4) };
  const name = scalar(record.name);
  if (name !== undefined) {
    out.name = name;
  }
  const description = scalar(record.description);
  if (description !== undefined) {
    out.description = description;
  }
  return out;
}

/**
 * A reference resolves against the skill's own directory or, failing that, the
 * repo root. Both bases are needed: across 1674 references measured in real
 * projects, 1645 resolved skill-relative and 12 only at the root — checking one
 * base alone would report those 12 as broken.
 */
function brokenReferences(
  body: string,
  skillDir: string,
  root: string,
): string[] {
  // A directory named like a file satisfies existsSync but cannot be read, so
  // the reference is still dead.
  const isFile = (p: string): boolean => {
    try {
      return statSync(p).isFile();
    } catch {
      return false;
    }
  };
  return skillReferences(body).filter(
    (rel) => !isFile(join(skillDir, rel)) && !isFile(join(root, rel)),
  );
}

function discoverSkillsInDir(
  dir: string,
  source: "project" | "global",
  errors: ConfigErrorFact[],
  root: string,
): SkillFact[] {
  if (!existsSync(dir)) {
    return [];
  }
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (err) {
    // An unreadable skills dir looks exactly like a project with no skills.
    errors.push({
      path: dir,
      kind: "unreadable",
      detail: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
  const skills: SkillFact[] = [];
  for (const name of entries) {
    // `.system` under ~/.codex/skills is a container holding six real skills,
    // not a skill — reporting it suggested deleting them. Mirrors the dotfile
    // filter discoverAgents already has.
    if (name.startsWith(".") || name === "node_modules") {
      continue;
    }
    const skillDir = join(dir, name);
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(skillDir);
    } catch {
      continue;
    }
    if (!st.isDirectory()) {
      continue;
    }
    const skillMd = join(skillDir, "SKILL.md");
    // existsSync cannot tell ENOENT from EACCES, so on an unreadable directory
    // "no SKILL.md" is a claim about a file we never got to look at.
    let dirReadable = true;
    try {
      readdirSync(skillDir);
    } catch (err) {
      dirReadable = false;
      errors.push({
        path: skillDir,
        kind: "unreadable",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
    const hasSkillMd = dirReadable && existsSync(skillMd);
    const fm = hasSkillMd
      ? readFrontmatter(skillMd, errors)
      : { hasFrontmatter: false as const };

    const fact: SkillFact = {
      id: name,
      path: skillDir,
      source,
      hasSkillMd,
      hasFrontmatter: fm.hasFrontmatter,
    };
    if (fm.unreadable === true || !dirReadable) {
      fact.unreadable = true;
    }
    if (fm.unparseable === true) {
      fact.unparseableFrontmatter = true;
    }
    if (fm.body !== undefined) {
      const broken = brokenReferences(fm.body, skillDir, root);
      if (broken.length > 0) {
        fact.brokenReferences = broken;
      }
    }
    if (fm.description !== undefined) {
      fact.description = fm.description;
    }
    if (fm.name !== undefined) {
      fact.frontmatterName = fm.name;
    }
    skills.push(fact);
  }
  return skills;
}

function discoverNestedClaudeSkills(
  root: string,
  configuredRoots: Set<string>,
  errors: ConfigErrorFact[],
): SkillFact[] {
  const out: SkillFact[] = [];
  const skip = new Set([".git", "node_modules", ".next", "dist", "build", "coverage"]);
  const walk = (dir: string): void => {
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      errors.push({ path: dir, kind: "unreadable", detail: "could not read nested skill directories" });
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || skip.has(entry.name) || (entry.name.startsWith(".") && entry.name !== ".claude")) continue;
      const child = join(dir, entry.name);
      if (entry.name === "skills" && basename(dir) === ".claude") {
        if (configuredRoots.has(child)) continue;
        out.push(...discoverSkillsInDir(child, "project", errors, root));
        continue;
      }
      walk(child);
    }
  };
  walk(root);
  return out;
}

function parseMcpServers(
  raw: unknown,
  filePath: string,
  errors: ConfigErrorFact[],
): McpFact[] {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    errors.push({
      path: filePath,
      kind: "unexpected-shape",
      detail: "MCP config root is not a JSON object",
    });
    return [];
  }
  const obj = raw as Record<string, unknown>;
  let servers: Record<string, unknown>;
  if (
    "mcpServers" in obj &&
    obj.mcpServers !== null &&
    typeof obj.mcpServers === "object" &&
    !Array.isArray(obj.mcpServers)
  ) {
    servers = obj.mcpServers as Record<string, unknown>;
  } else if (
    !("mcpServers" in obj) &&
    Object.keys(obj).length > 0 &&
    // Every value must look like a server entry. Without this a wrapper key —
    // the VS Code `servers` spelling, or `inputs` — becomes a phantom server
    // reported as having no command, while the real servers under it are never
    // inspected.
    Object.values(obj).every(
      (v) =>
        v !== null &&
        typeof v === "object" &&
        !Array.isArray(v) &&
        ("command" in v || "url" in v || "type" in v),
    )
  ) {
    servers = obj;
  } else {
    errors.push({
      path: filePath,
      kind: "unexpected-shape",
      detail: "no usable `mcpServers` object and the root is not a server map",
    });
    return [];
  }

  const facts: McpFact[] = [];
  for (const [name, value] of Object.entries(servers)) {
    let hasCommand = false;
    let hasUrl = false;
    let transport: string | undefined;
    const literalEnvKeys: string[] = [];
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const entry = value as Record<string, unknown>;
      hasCommand =
        typeof entry.command === "string" && entry.command.length > 0;
      hasUrl = typeof entry.url === "string" && entry.url.length > 0;
      if (typeof entry.type === "string" && entry.type.length > 0) {
        transport = entry.type;
      }
      const env = entry.env;
      if (env !== null && typeof env === "object" && !Array.isArray(env)) {
        for (const [key, val] of Object.entries(env as Record<string, unknown>)) {
          // Gate on the key, not the value length. PATH, NODE_OPTIONS and
          // LOG_FORMAT are all long and none is a secret — the same "narrow, no
          // entropy guessing" principle SECRET_PATTERNS commits to.
          if (
            typeof val === "string" &&
            val.length > 0 &&
            !/\$\{[A-Za-z_][A-Za-z0-9_]*(?::-[^}]*)?\}/.test(val) &&
            /(?:TOKEN|SECRET|KEY|PASSWORD|PASSWD|CREDENTIAL)S?$/i.test(key)
          ) {
            literalEnvKeys.push(key);
          }
        }
      }
    }
    facts.push({
      name,
      path: filePath,
      hasCommand,
      hasUrl,
      ...(transport === undefined ? {} : { transport }),
      literalEnvKeys,
      raw: JSON.stringify(value),
    });
  }
  return facts;
}

function discoverMcp(
  root: string,
  mcpPaths: string[],
  errors: ConfigErrorFact[],
): McpFact[] {
  const facts: McpFact[] = [];
  const seen = new Set<string>();
  for (const rel of mcpPaths) {
    const filePath = join(root, rel);
    if (!existsSync(filePath)) {
      continue;
    }
    const raw = readJsonConfig(filePath, errors);
    if (raw === undefined) {
      continue;
    }
    for (const fact of parseMcpServers(raw, filePath, errors)) {
      const key = `${fact.name}@${fact.path}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      facts.push(fact);
    }
  }
  return facts;
}

const INTERPRETERS = /^(?:bash|sh|zsh|python3?|node|bun|deno)$/;
/** Flags that mean "the next argument is source code, not a file". */
const INLINE_CODE_FLAGS = /^-(?:e|p|c)$/;
/** Anything that makes the command a shell program rather than one invocation. */
const SHELL_METACHARS = /[|;&`]|\$\(|\|\||&&/;

/**
 * Pull the script path out of a hook command, so a hook whose script is gone can
 * be reported. Returns undefined whenever the answer is not certain.
 *
 * Deliberately conservative: a wrong "this hook is broken" on a guard hook is as
 * damaging as missing a real one. Shell programs (`a && b`, `$(...)`, pipes) are
 * skipped outright, because a command like `[ ! -f x ] || node x` handles the
 * missing file itself and flagging it would be a false positive.
 */
export function hookScriptPath(command: string): string | undefined {
  const trimmed = command.trim();
  if (trimmed.length === 0 || SHELL_METACHARS.test(trimmed)) {
    return undefined;
  }

  const tokens = trimmed.match(/"[^"]*"|'[^']*'|\S+/g);
  if (tokens === null || tokens.length === 0) {
    return undefined;
  }

  const unquote = (t: string): string =>
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
      ? t.slice(1, -1)
      : t;

  let i = 0;
  const first = unquote(tokens[0] as string);
  let interpreted = false;
  if (INTERPRETERS.test(first)) {
    interpreted = true;
    i = 1;
    while (i < tokens.length) {
      const flag = unquote(tokens[i] as string);
      if (!flag.startsWith("-")) {
        break;
      }
      // `node -e "<code>"` — the next token is source, never a path
      if (INLINE_CODE_FLAGS.test(flag)) {
        return undefined;
      }
      i += 1;
    }
  }

  const candidate = tokens[i] === undefined ? undefined : unquote(tokens[i] as string);
  if (candidate === undefined || (!candidate.includes("/") && !(interpreted && /\.(?:js|mjs|cjs|ts|py|sh|bash|zsh)$/i.test(candidate)))) {
    return undefined;
  }
  // A drive-letter path cannot be resolved here; do not guess.
  if (/^[A-Za-z]:[/\\]/.test(candidate)) {
    return undefined;
  }
  // Only CLAUDE_PROJECT_DIR has a defined meaning; other vars are unknowable.
  if (candidate.startsWith("$")) {
    return /^\$(?:CLAUDE_PROJECT_DIR\b|\{CLAUDE_PROJECT_DIR\})/.test(candidate)
      ? candidate
      : undefined;
  }
  if (
    candidate.startsWith("/") ||
    candidate.startsWith("./") ||
    candidate.startsWith("../") ||
    candidate.startsWith("~/") ||
    candidate.startsWith(".")
  ) {
    return candidate;
  }
  return undefined;
}

function resolveHookScript(
  root: string,
  raw: string,
): { scriptPath: string; exists: boolean } | undefined {
  const extracted = hookScriptPath(raw);
  if (extracted === undefined) {
    return undefined;
  }
  let expanded = extracted;
  if (expanded.startsWith("~/")) {
    expanded = join(homedir(), expanded.slice(2));
  } else if (expanded.startsWith("$")) {
    // CLAUDE_PROJECT_DIR is the project root by definition
    expanded = expanded.replace(
      /^\$(?:CLAUDE_PROJECT_DIR|\{CLAUDE_PROJECT_DIR\})\/?/,
      "",
    );
  }
  const abs = isAbsolute(expanded) ? expanded : join(root, expanded);
  return { scriptPath: extracted, exists: existsSync(abs) };
}

function discoverHooks(
  root: string,
  errors: ConfigErrorFact[],
): HookFact[] {
  const files = [
    join(root, ".claude", "settings.json"),
    join(root, ".claude", "settings.local.json"),
  ];
  const facts: HookFact[] = [];
  for (const filePath of files) {
    if (!existsSync(filePath)) {
      continue;
    }
    const raw = readJsonConfig(filePath, errors);
    if (raw === undefined) {
      continue;
    }
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      errors.push({
        path: filePath,
        kind: "unexpected-shape",
        detail: "settings file is not a JSON object",
      });
      continue;
    }
    const hooks = (raw as Record<string, unknown>).hooks;
    if (hooks === undefined) {
      continue;
    }
    if (hooks === null || typeof hooks !== "object" || Array.isArray(hooks)) {
      errors.push({
        path: filePath,
        kind: "unexpected-shape",
        detail: "`hooks` is not an object",
      });
      continue;
    }

    for (const [event, groups] of Object.entries(
      hooks as Record<string, unknown>,
    )) {
      const malformed = !Array.isArray(groups) || groups.some((group) => {
        if (group === null || typeof group !== "object" || Array.isArray(group)) {
          return true;
        }
        const inner = (group as Record<string, unknown>).hooks;
        if (!Array.isArray(inner)) return true;
        return inner.some((entry) => {
          if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
            return true;
          }
          const item = entry as Record<string, unknown>;
          return (
            (item.command !== undefined &&
              (typeof item.command !== "string" || item.command.length === 0)) ||
            (item.type === "command" && typeof item.command !== "string")
          );
        });
      });
      if (malformed) {
        errors.push({ path: filePath, kind: "unexpected-shape", detail: `invalid hook groups for ${event}` });
        continue;
      }
      const commands = collectHookCommands(groups);
      if (commands.length === 0) {
        facts.push({ name: event, path: filePath, event });
        continue;
      }
      for (const command of commands) {
        const fact: HookFact = { name: event, path: filePath, event, command };
        const resolved = resolveHookScript(root, command);
        if (resolved !== undefined) {
          fact.scriptPath = resolved.scriptPath;
          fact.scriptExists = resolved.exists;
        }
        facts.push(fact);
      }
    }
  }
  return facts;
}

/** `hooks[event]` is an array of matcher groups, each with a `hooks` array. */
function collectHookCommands(groups: unknown): string[] {
  if (!Array.isArray(groups)) {
    return [];
  }
  const out: string[] = [];
  for (const group of groups) {
    if (group === null || typeof group !== "object" || Array.isArray(group)) {
      continue;
    }
    const inner = (group as Record<string, unknown>).hooks;
    if (!Array.isArray(inner)) {
      continue;
    }
    for (const entry of inner) {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
        continue;
      }
      const command = (entry as Record<string, unknown>).command;
      if (typeof command === "string" && command.length > 0) {
        out.push(command);
      }
    }
  }
  return out;
}

/** Agent definitions nest, so a one-level scan misses `agents/review/x.md`. */
function agentFiles(dir: string, errors: ConfigErrorFact[]): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir, { withFileTypes: true }).map((e) =>
      e.isDirectory() ? `${e.name}/` : e.name,
    );
  } catch (err) {
    errors.push({
      path: dir,
      kind: "unreadable",
      detail: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    if (entry.startsWith(".")) {
      continue;
    }
    if (entry.endsWith("/")) {
      out.push(
        ...agentFiles(join(dir, entry.slice(0, -1)), errors).map((p) =>
          join(entry.slice(0, -1), p),
        ),
      );
      continue;
    }
    out.push(entry);
  }
  return out;
}

function discoverAgents(root: string, errors: ConfigErrorFact[]): AgentFact[] {
  const dir = join(root, ".claude", "agents");
  if (!existsSync(dir)) {
    return [];
  }
  const entries = agentFiles(dir, errors);
  const facts: AgentFact[] = [];
  for (const name of entries) {
    // Agent definitions are markdown; .gitkeep and .DS_Store are not agents,
    // and counting them inflates the budget.agents rule. Dotfiles are already
    // filtered by agentFiles, including in nested directories.
    if (!name.endsWith(".md")) {
      continue;
    }
    const filePath = join(dir, name);
    try {
      const st = statSync(filePath);
      if (!st.isFile()) {
        continue;
      }
    } catch {
      continue;
    }
    const fm = readFrontmatter(filePath, errors);
    const fact: AgentFact = {
      name: name.slice(0, -".md".length),
      path: filePath,
      hasFrontmatter: fm.hasFrontmatter,
    };
    if (fm.unreadable === true) {
      fact.unreadable = true;
    }
    if (fm.unparseable === true) {
      fact.unparseableFrontmatter = true;
    }
    if (fm.name !== undefined) {
      fact.frontmatterName = fm.name;
    }
    if (fm.description !== undefined) {
      fact.description = fm.description;
    }
    facts.push(fact);
  }
  return facts;
}

function discoverPolicyFiles(
  root: string,
  policyFiles: string[],
  errors: ConfigErrorFact[],
): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  for (const rel of policyFiles) {
    const filePath = join(root, rel);
    if (!existsSync(filePath)) {
      continue;
    }
    try {
      const result = readCapped(filePath, POLICY_CAP);
      const text = result.buf.subarray(0, POLICY_CAP).toString("utf8");
      out.push({ path: filePath, text });
      if (result.truncated) errors.push({ path: filePath, kind: "unexpected-shape", detail: `file exceeds ${POLICY_CAP} byte scan cap` });
    } catch (err) {
      errors.push({
        path: filePath,
        kind: "unreadable",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return out;
}

/**
 * skills-lock.json — the oracle for which skills are managed installs pinned to
 * an upstream source, and which are local and unpinned.
 */
function discoverSkillsLock(
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

/**
 * Enumerate project (and optionally global) agent surface: skills, agents, hooks,
 * MCP, policy, lockfile. Config files that cannot be parsed are reported through
 * `configErrors` instead of being silently dropped.
 */
export function discoverAgentSurface(
  root: string,
  config: AgentscanConfig,
  opts: { includeGlobal: boolean },
): AgentSurface {
  const configErrors: ConfigErrorFact[] = [];
  const skills: SkillFact[] = [];
  for (const rel of config.skillPaths) {
    skills.push(...discoverSkillsInDir(join(root, rel), "project", configErrors, root));
  }
  const configuredRoots = new Set(config.skillPaths.map((rel) => resolve(root, rel)));
  skills.push(...discoverNestedClaudeSkills(root, configuredRoots, configErrors));

  if (opts.includeGlobal) {
    const home = homedir();
    skills.push(
      ...discoverSkillsInDir(join(home, ".claude", "skills"), "global", configErrors, root),
    );
    skills.push(
      ...discoverSkillsInDir(join(home, ".codex", "skills"), "global", configErrors, root),
    );
  }

  const lock = discoverSkillsLock(root, configErrors);

  return {
    skills: disambiguateSkills(skills, root),
    agents: discoverAgents(root, configErrors),
    hooks: discoverHooks(root, configErrors),
    mcp: discoverMcp(root, config.mcpPaths, configErrors),
    policyFiles: discoverPolicyFiles(root, config.policyFiles, configErrors),
    lockedSkills: lock.locked,
    hasSkillsLock: lock.present,
    skillsLockInvalid: lock.invalid,
    configErrors,
  };
}

/**
 * Keep every path. Qualify only colliding ids so findings and lock checks stay distinct.
 */
function disambiguateSkills(skills: SkillFact[], root: string): SkillFact[] {
  const counts = new Map<string, number>();
  for (const skill of skills) counts.set(skill.id, (counts.get(skill.id) ?? 0) + 1);
  return skills.map((skill) => {
    if ((counts.get(skill.id) ?? 0) < 2) return skill;
    const location = skill.source === "project"
      ? skill.path.slice(root.length + 1)
      : `global:${skill.path}`;
    return { ...skill, instanceId: `${skill.id}@${location}` };
  });
}
