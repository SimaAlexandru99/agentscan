import { createHash } from "node:crypto";
import { join } from "node:path";

export type SpecSurface = {
  provider: string;
  surface: "instructions" | "skills" | "agents" | "hooks" | "mcp" | "rules";
  lastVerified: string;
  sourceType: "official" | "vendor-recommendation";
  stalenessRisk: "low" | "medium" | "high";
  url: string;
};

/**
 * Baseline content hashes, one per unique URL in `SPEC_SURFACES`, owned and
 * rewritten only by `bun run spec:record`. The page text itself is never
 * stored; a changed hash is the signal to open the URL and re-read the capture.
 */
export const SPEC_HASHES_PATH = join(import.meta.dir, "spec-hashes.json");

export type SpecHashBaseline = Record<string, { hash: string; recorded: string }>;

const ENTITY_NAMES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function unescapeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
    }
    if (body.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
    }
    return ENTITY_NAMES[body.toLowerCase()] ?? whole;
  });
}

function hasProse(fragment: string): boolean {
  return fragment.replace(/<[^>]+>/g, " ").trim().length > 0;
}

/**
 * The first `<tag>…</tag>` block that contains any text. An empty `<main>`
 * (a client-rendered shell, or a layout placeholder) must not be preferred
 * over a `<body>` that holds the prose, or the hash would track nothing.
 */
function firstBlock(html: string, tag: string): string | undefined {
  const pattern = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  for (const match of html.matchAll(pattern)) {
    const inner = match[1];
    if (inner !== undefined && hasProse(inner)) {
      return inner;
    }
  }
  return undefined;
}

/**
 * Reduce a documentation page to the prose a reader sees, so that two fetches
 * of an unchanged page hash the same and a changed sentence changes the hash.
 *
 * Scripts, styles, and site furniture (`nav`, `header`, `footer`, `aside`) are
 * dropped because they carry build ids and menus that move without the spec
 * moving. When the page marks its content with `<main>` or `<article>`, only
 * that region is kept. This is deliberately a text reduction, not a parser:
 * a hash that changes for a cosmetic reason costs one re-read, while a hash
 * that stays put across a real change would repeat the seven false positives
 * of 2026-09-02.
 */
export function normalizeSpecText(html: string): string {
  let text = html.replace(/<!--[\s\S]*?-->/g, "");
  for (const tag of ["script", "style", "noscript", "svg", "nav", "header", "footer", "aside"]) {
    text = text.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, "gi"), " ");
  }
  const region = firstBlock(text, "main") ?? firstBlock(text, "article") ?? firstBlock(text, "body") ?? text;
  // Source formatting is not content: a site that re-wraps its HTML must hash
  // the same. Only block-level tags may introduce a line break.
  const stripped = region
    .replace(/\s+/g, " ")
    .replace(/<(?:br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/pre|\/td|\/th)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return unescapeEntities(stripped)
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

export function specContentHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
}

/**
 * Below this many characters a "page" is almost certainly a fetch or selector
 * failure (an error shell, a redirect stub), not documentation. The shortest
 * real capture in the set is the Grok subagents page at ~750 characters.
 */
export const SUSPICIOUSLY_SHORT_PAGE_CHARS = 200;

/** URLs a complete baseline must contain but the given one does not. */
export function missingBaselineUrls(
  baseline: SpecHashBaseline,
  urls: readonly string[] = uniqueSurfaceUrls(),
): string[] {
  return urls.filter((url) => baseline[url] === undefined);
}

/**
 * Machine list of captured surfaces. `spec:check` warns when lastVerified is
 * older than 90 days. Network fetches stay in this script, never on `check`.
 */
export const SPEC_SURFACES: SpecSurface[] = [
  {
    provider: "agent-skills",
    surface: "skills",
    lastVerified: "2026-09-03",
    sourceType: "official",
    stalenessRisk: "medium",
    url: "https://agentskills.io/specification",
  },
  {
    provider: "AGENTS.md",
    surface: "instructions",
    lastVerified: "2026-09-02",
    sourceType: "official",
    stalenessRisk: "medium",
    url: "https://agents.md/",
  },
  {
    provider: "claude",
    surface: "instructions",
    lastVerified: "2026-09-02",
    sourceType: "official",
    stalenessRisk: "medium",
    url: "https://code.claude.com/docs/en/memory",
  },
  {
    provider: "claude",
    surface: "skills",
    lastVerified: "2026-09-02",
    sourceType: "official",
    stalenessRisk: "medium",
    url: "https://code.claude.com/docs/en/skills",
  },
  {
    provider: "claude",
    surface: "agents",
    lastVerified: "2026-09-03",
    sourceType: "official",
    stalenessRisk: "medium",
    url: "https://code.claude.com/docs/en/sub-agents",
  },
  {
    provider: "claude",
    surface: "hooks",
    lastVerified: "2026-09-03",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://code.claude.com/docs/en/hooks",
  },
  {
    provider: "claude",
    surface: "mcp",
    lastVerified: "2026-09-02",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://code.claude.com/docs/en/mcp",
  },
  {
    provider: "codex",
    surface: "instructions",
    lastVerified: "2026-09-02",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://learn.chatgpt.com/docs/agent-configuration/agents-md",
  },
  {
    provider: "codex",
    surface: "mcp",
    lastVerified: "2026-09-03",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://learn.chatgpt.com/docs/extend/mcp",
  },
  {
    provider: "codex",
    surface: "mcp",
    lastVerified: "2026-09-02",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://developers.openai.com/codex/config-advanced",
  },
  {
    provider: "codex",
    surface: "skills",
    lastVerified: "2026-09-02",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://agentskills.io/specification",
  },
  {
    provider: "vscode",
    surface: "instructions",
    lastVerified: "2026-08-31",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://code.visualstudio.com/docs/agent-customization/custom-instructions",
  },
  {
    provider: "vscode",
    surface: "agents",
    lastVerified: "2026-08-31",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://code.visualstudio.com/docs/agent-customization/custom-agents",
  },
  {
    provider: "vscode",
    surface: "hooks",
    lastVerified: "2026-09-02",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://code.visualstudio.com/docs/agent-customization/hooks",
  },
  {
    provider: "vscode",
    surface: "mcp",
    lastVerified: "2026-09-02",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://code.visualstudio.com/docs/copilot/customization/mcp-servers",
  },
  {
    provider: "cursor",
    surface: "skills",
    lastVerified: "2026-09-02",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://cursor.com/docs/skills",
  },
  {
    provider: "cursor",
    surface: "rules",
    lastVerified: "2026-09-03",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://cursor.com/docs/rules",
  },
  {
    provider: "cursor",
    surface: "mcp",
    lastVerified: "2026-09-02",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://cursor.com/docs/context/mcp",
  },
  {
    provider: "cursor",
    surface: "hooks",
    lastVerified: "2026-09-03",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://cursor.com/docs/hooks",
  },
  {
    provider: "antigravity",
    surface: "mcp",
    lastVerified: "2026-09-03",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://antigravity.google/docs/mcp",
  },
  {
    provider: "gemini",
    surface: "mcp",
    lastVerified: "2026-09-03",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md",
  },
  {
    provider: "gemini",
    surface: "hooks",
    lastVerified: "2026-09-03",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/index.md",
  },
  {
    provider: "gemini",
    surface: "hooks",
    lastVerified: "2026-09-03",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md",
  },
  {
    provider: "opencode",
    surface: "mcp",
    lastVerified: "2026-09-03",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://opencode.ai/v2/docs/mcp-servers",
  },
  {
    provider: "continue",
    surface: "mcp",
    lastVerified: "2026-09-02",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://docs.continue.dev/customize/deep-dives/mcp",
  },
  {
    provider: "commandcode",
    surface: "mcp",
    lastVerified: "2026-09-02",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://commandcode.ai/docs/mcp",
  },
  {
    provider: "commandcode",
    surface: "hooks",
    lastVerified: "2026-09-02",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://commandcode.ai/docs/hooks",
  },
  {
    provider: "commandcode",
    surface: "skills",
    lastVerified: "2026-09-02",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://commandcode.ai/docs/skills",
  },
  {
    provider: "commandcode",
    surface: "agents",
    lastVerified: "2026-09-03",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://commandcode.ai/docs/agents",
  },
  {
    provider: "commandcode",
    surface: "instructions",
    lastVerified: "2026-08-31",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://commandcode.ai/docs/memory",
  },
  {
    provider: "copilot",
    surface: "hooks",
    lastVerified: "2026-09-02",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://docs.github.com/en/copilot/reference/hooks-reference",
  },
  {
    provider: "grok",
    surface: "mcp",
    lastVerified: "2026-09-02",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://docs.x.ai/build/features/mcp-servers",
  },
  {
    provider: "grok",
    surface: "hooks",
    lastVerified: "2026-09-03",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://docs.x.ai/build/features/hooks",
  },
  {
    provider: "grok",
    surface: "skills",
    lastVerified: "2026-09-02",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://docs.x.ai/build/features/skills-plugins-marketplaces",
  },
  {
    provider: "grok",
    surface: "rules",
    lastVerified: "2026-08-31",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://docs.x.ai/build/features/project-rules",
  },
  {
    provider: "grok",
    surface: "agents",
    lastVerified: "2026-08-31",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://docs.x.ai/build/features/subagents",
  },
  {
    provider: "windsurf",
    surface: "rules",
    lastVerified: "2026-09-03",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://docs.windsurf.com/windsurf/cascade/memories",
  },
  {
    provider: "windsurf",
    surface: "instructions",
    lastVerified: "2026-08-31",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://docs.windsurf.com/windsurf/cascade/agents-md",
  },
  {
    provider: "windsurf",
    surface: "mcp",
    lastVerified: "2026-09-03",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://docs.windsurf.com/windsurf/cascade/mcp",
  },
  {
    provider: "windsurf",
    surface: "hooks",
    lastVerified: "2026-09-03",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://docs.devin.ai/desktop/cascade/hooks",
  },
  {
    provider: "windsurf",
    surface: "skills",
    lastVerified: "2026-08-31",
    sourceType: "official",
    stalenessRisk: "high",
    url: "https://docs.devin.ai/desktop/cascade/skills",
  },
];

const STALE_AFTER_DAYS = 90;

/** Unique URLs to fetch; two surfaces may cite the same page. */
export function uniqueSurfaceUrls(surfaces: readonly SpecSurface[] = SPEC_SURFACES): string[] {
  return [...new Set(surfaces.map((surface) => surface.url))];
}

/**
 * Where to fetch a surface's text from. The documented `url` is what a human
 * opens; a GitHub `blob` page renders client-side and hashes to an error
 * placeholder, so its raw file is fetched instead. Everything else is fetched
 * as written.
 */
export function fetchUrlFor(url: string): string {
  const blob = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/.exec(url);
  if (blob !== null) {
    const [, owner, repo, ref, path] = blob;
    return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`;
  }
  return url;
}

export function surfacesForUrl(
  url: string,
  surfaces: readonly SpecSurface[] = SPEC_SURFACES,
): SpecSurface[] {
  return surfaces.filter((surface) => surface.url === url);
}

export function surfaceStalenessNotes(today = Date.now()): string[] {
  const notes: string[] = [];
  for (const surface of SPEC_SURFACES) {
    const days = Math.floor((today - Date.parse(surface.lastVerified)) / 86_400_000);
    if (days > STALE_AFTER_DAYS) {
      notes.push(
        `${surface.provider} ${surface.surface} lastVerified ${surface.lastVerified} is ${days} days old (over ${STALE_AFTER_DAYS}) — ${surface.url}`,
      );
    }
  }
  return notes;
}
