import { AGENTSCAN_SKILL_MD } from "@/lib/skill";
import {
  absoluteUrl,
  CHECK_COMMAND,
  GITHUB_ISSUES,
  GITHUB_REPO,
  NPM_PACKAGE,
  NPM_URL,
  PRODUCT_CHECKS,
  PRODUCT_NAME,
  PRODUCT_VERSION,
  RUN_COMMAND,
  SITE_ORIGIN,
} from "@/lib/site";

export type MarkdownPage = {
  status: number;
  body: string;
};

export const NOT_FOUND_MARKDOWN = `# Not found

This path does not exist on ${SITE_ORIGIN.replace("https://", "")}.

Where to look next:

- [Docs](${absoluteUrl("/docs")})
- [llms.txt](${absoluteUrl("/llms.txt")})
- [Sitemap](${absoluteUrl("/sitemap.xml")})
- [Home](${absoluteUrl("/")})

${PRODUCT_NAME} is a local CLI. Run \`${RUN_COMMAND}\`.
`;

export const HOME_MARKDOWN = `# ${PRODUCT_NAME}

Your agent config says the guard is on. The script is gone. Nothing told you.

${PRODUCT_VERSION} · ${PRODUCT_CHECKS} checks · offline on check

Linters read the code your agent writes. This reads the agent itself — skills, hooks, MCP servers, lockfiles, and policy files.

## How to run

\`\`\`bash
${CHECK_COMMAND}
\`\`\`

Or: \`${RUN_COMMAND}\`

## How it works

No AI, no network on check. Read the config, read the disk, compare. Same tree in, same findings out, every time.

- ${PRODUCT_CHECKS} checks, each labeled spec-required, vendor-recommendation, security, internal-consistency, or heuristic.
- No network — check never opens a socket.
- Writes nothing — the scanned tree is left untouched.
- Spec-required checks cite a published line in [docs/spec/](${GITHUB_REPO}/tree/master/docs/spec). Heuristics stay at info and are labeled.

## Why the tool looks like this

An earlier build reported 37 findings across 17 real projects of which 25 were false — two checks had been written from what real projects looked like instead of from the spec. Both were deleted. Spec-required checks cite a published line in docs/spec/. Heuristics stay at info and are labeled. ${PRODUCT_VERSION} is the first stable release: ${PRODUCT_CHECKS} checks, 345 tests, still offline on check.

## For agents

Agents forget the audit. The skill tells them to run it before they edit a hook or claim a guard is on.

- When: hooks · skills · MCP · AGENTS.md · skills-lock.json
- Do: \`${RUN_COMMAND} --output prompt\`
- Do not skip \`claude.hook.missing-script\` (error)
- Don't write the tree or guess if a hook is valid

This origin is a marketing site. There is no hosted HTTP API and no Streamable HTTP MCP server here. MCP in product copy means MCP *configs the CLI audits*.

- [Docs](${absoluteUrl("/docs")})
- [GitHub](${GITHUB_REPO})
- [npm ${NPM_PACKAGE}](${NPM_URL})
`;

export const DOCS_MARKDOWN = `# ${PRODUCT_NAME} docs

${PRODUCT_NAME} ${PRODUCT_VERSION} audits agent configuration on disk — ${PRODUCT_CHECKS} checks. Scans are read-only and never open a network connection. Spec-required checks cite a published spec line; heuristics stay at info and are labeled. Full behavior lives in the [README](${GITHUB_REPO}#readme).

## Quickstart

Run against any project. It reads that project, writes nothing, and never leaves your machine.

### npx

\`\`\`bash
cd ~/your-project
${RUN_COMMAND}
# or explicitly:
npx ${NPM_PACKAGE} check
\`\`\`

### bunx

\`\`\`bash
bunx --bun ${NPM_PACKAGE}
# or after install:
bun add -d ${NPM_PACKAGE}
bunx agentscan check
\`\`\`

### From a checkout

\`\`\`bash
git clone --depth=1 ${GITHUB_REPO}
cd agentscan && bun install
bun run src/cli.ts check ~/your-project
\`\`\`

The package is scoped \`${NPM_PACKAGE}\` because npm rejects the bare name. The command you type stays \`agentscan\`.

## Flags for check

| Flag | Meaning |
| --- | --- |
| \`--json\` | JSON report (alias for --output json) |
| \`--output <format>\` | human (default) · json · prompt |
| \`--copy\` | Also copy the report to the system clipboard |
| \`--no-color\` | Never colour, even on a terminal (NO_COLOR=1 does the same) |
| \`--quiet\` | Summary line only |
| \`--verbose\` | Show KEEP + info-severity findings, and print each finding's id |
| \`--fail-on <level>\` | never (default) · warning · error |
| \`--fail-under <0-100>\` | Fail when the score drops below this floor |
| \`--global\` | Also scan ~/.claude/skills and ~/.codex/skills |
| \`--config <path>\` | Config file path |

v1 does not write the tree — no apply, no skill delete/install. Findings may suggest shell commands; you run them yourself.

## Skill

Agents forget the audit. Copy \`skills/agentscan\` into the project so they run it before editing hooks or claiming a guard is on.

\`\`\`bash
cp -R skills/agentscan .cursor/skills/agentscan
# or: .agents/skills/agentscan
# or: .claude/skills/agentscan
\`\`\`

### When

- Hook, skill, MCP, or AGENTS.md work
- Someone says a guard is on and you have not verified the script
- A PR touches \`.claude/\`, \`.agents/\`, \`.mcp.json\`, or \`skills-lock.json\`

### Do

From the repo root. Findings are facts. Do not skip \`claude.hook.missing-script\` (error).

\`\`\`bash
${RUN_COMMAND} --output prompt
\`\`\`

No project handy — \`demo\` builds a throwaway fixture, prints the report, and deletes it:

\`\`\`bash
${RUN_COMMAND} demo
\`\`\`

### Don't

- Write the scanned tree
- Guess with the model whether a hook is valid
- Compare a skill's frontmatter \`name\` to its directory, or validate model ids

## CI

The Action runs from its own checkout, so it uses the ref you pin rather than whatever is on npm:

\`\`\`yaml
- uses: SimaAlexandru99/agentscan@v1
  with:
    fail-on: error        # never | warning | error
    output: human         # human | json | prompt
\`\`\`

Or run it directly:

\`\`\`yaml
- name: agentscan
  run: bunx agentscan check --fail-on error
\`\`\`

Default \`failOn\` is \`never\` so local runs stay non-blocking until you opt in.
`;

export const ABOUT_MARKDOWN = `# About ${PRODUCT_NAME}

${PRODUCT_NAME} is a local command-line linter for agent configuration. ${PRODUCT_VERSION} ships ${PRODUCT_CHECKS} checks. It reads skills, \`skills-lock.json\`, hooks, MCP server configs, agent definitions, and instruction files such as \`AGENTS.md\`, then reports where the config disagrees with the disk.

It exists for a specific failure: a hook still registered after its script was deleted. The agent starts. Nothing in the editor, the runtime, or a normal test suite tells you the guard is gone. ${PRODUCT_NAME} compares the config to the filesystem and prints the miss as \`claude.hook.missing-script\` at error.

The product is the published npm package \`${NPM_PACKAGE}\` (the bare name was rejected as too close to an unrelated package). The command you type is \`agentscan\`. Run it with \`${RUN_COMMAND}\` on Node 20.11+ or Bun. Scans are read-only: they do not write the tree they scan and they do not open a network connection.

An earlier build reported 37 findings across 17 real projects of which 25 were false, because two checks were written from what projects happened to look like instead of from a published spec line. Those checks were deleted. Spec-required checks now cite a line in [docs/spec/](${GITHUB_REPO}/tree/master/docs/spec). Heuristics stay at info and are labeled. ${PRODUCT_VERSION} is the first stable release.

This website is the public marketing and docs surface for that CLI. It is not a hosted scanner, not a SaaS dashboard, and not NextJourney. There is no account system on this origin.

Source: [${GITHUB_REPO}](${GITHUB_REPO}). License: MIT.
`;

export const CONTACT_MARKDOWN = `# Contact ${PRODUCT_NAME}

${PRODUCT_NAME} is an open-source CLI. There is no sales phone number, no support mailbox invented for this page, and no ticket form on this site.

Public contact for the project:

- GitHub issues and discussion: [${GITHUB_ISSUES}](${GITHUB_ISSUES})
- Source repository: [${GITHUB_REPO}](${GITHUB_REPO})
- Published package: [${NPM_URL}](${NPM_URL}) (\`${NPM_PACKAGE}\` ${PRODUCT_VERSION})

Use GitHub issues for bugs, false findings, spec questions, and docs mistakes. Include the command you ran (\`${RUN_COMMAND}\` or \`${CHECK_COMMAND}\`), the ${PRODUCT_NAME} version, and a redacted snippet of the config you scanned. Do not paste secrets, tokens, or \`.env\` contents into an issue.

The CLI itself does not phone home. A local \`check\` does not open a socket, so running the tool does not create a support session and does not register you anywhere. If you want a change in the product, the reviewable path is a GitHub issue or a pull request on the public repository.

This page is the contact path for agentscan.space. It does not list a street address, a company switchboard, or a personal phone number because those are not published contact methods for this product.
`;

export const PRIVACY_MARKDOWN = `# Privacy — ${PRODUCT_NAME}

This page describes the public website ${SITE_ORIGIN} and the local CLI \`${NPM_PACKAGE}\`. It is not legal advice. It does not invent analytics vendors, DSNs, or contact details that are not already public for this project.

The website is a static marketing and documentation site. It does not create accounts, accept payments, or host a scanner that uploads your repository. There is no sign-in form and no newsletter form on these pages. We do not ask for your email address here.

The product you install is a local process. On \`check\`, ${PRODUCT_NAME} ${PRODUCT_VERSION} reads files on the machine where you run it, compares config to disk, and prints findings. It writes nothing to the scanned tree and does not open a network connection. Your agent configs, lockfiles, and secrets stay on your computer unless you choose to paste them somewhere else (for example into a GitHub issue). Do not paste secrets into issues.

Hosting the website may produce ordinary HTTP access logs at the host (the site is deployed as a Next.js app on Vercel, as documented in the site README). This project does not add a third-party marketing pixel or an application database of visitors. We do not sell visitor data; there is no visitor product.

If you file an issue on GitHub, GitHub's privacy policy applies to that content. The npm registry's policy applies to installs of \`${NPM_PACKAGE}\`.

Questions about this page: open a GitHub issue at [${GITHUB_ISSUES}](${GITHUB_ISSUES}).
`;

export const LLMS_TXT = `# ${PRODUCT_NAME}

> Offline linter for agent configuration. ${PRODUCT_VERSION}, ${PRODUCT_CHECKS} checks. No AI, no network on check, writes nothing to the scanned tree.

${PRODUCT_NAME} is a local CLI, not a hosted HTTP API. This origin has no OpenAPI document, no public REST or GraphQL API, and no Streamable HTTP MCP server. "MCP" in the product copy means MCP configs the CLI audits (can they start). To run the product, use the CLI or the skill — do not look for \`/mcp\` here.

## When to use

Lint agent configuration on disk. Best-fit jobs:

- Hooks whose registered scripts may be missing (\`claude.hook.missing-script\` is error)
- MCP server configs in the project (audit, not a remote MCP of ${PRODUCT_NAME} itself)
- Skills and \`skills-lock.json\`
- \`AGENTS.md\` and other instruction files

How an agent should call it:

\`\`\`bash
${RUN_COMMAND}
\`\`\`

For a paste-ready handoff: \`${RUN_COMMAND} --output prompt\`

Do not skip \`claude.hook.missing-script\` (error). Heuristics stay at info and are labeled. Do not write the scanned tree.

## Docs

- [agentscan docs](${absoluteUrl("/docs.md")}): Quickstart, check flags, skill, CI
- [Homepage](${absoluteUrl("/index.md")}): What the tool is and the failure it exists for
- [Skill](${absoluteUrl("/.well-known/agent-skills/agentscan/SKILL.md")}): When to run the audit

## Product

- [GitHub](${GITHUB_REPO}): Source, README, spec evidence
- [npm ${NPM_PACKAGE}](${NPM_URL}): Published CLI ${PRODUCT_VERSION}
- [docs/spec](${GITHUB_REPO}/tree/master/docs/spec): Cited spec lines for spec-required checks

## Site

- [About](${absoluteUrl("/about.md")})
- [Contact](${absoluteUrl("/contact.md")}): GitHub issues and npm only
- [Privacy](${absoluteUrl("/privacy.md")})
- [Sitemap](${absoluteUrl("/sitemap.xml")})
- [robots.txt](${absoluteUrl("/robots.txt")})

## Optional

- [Changelog](${GITHUB_REPO}/blob/master/CHANGELOG.md)
`;

const PAGES: Record<string, string> = {
  "/": HOME_MARKDOWN,
  "/docs": DOCS_MARKDOWN,
  "/about": ABOUT_MARKDOWN,
  "/contact": CONTACT_MARKDOWN,
  "/privacy": PRIVACY_MARKDOWN,
  "/llms.txt": LLMS_TXT,
  "/.well-known/agent-skills/agentscan/skill": AGENTSCAN_SKILL_MD,
};

export function normalizeContentPath(pathname: string): string {
  let path = pathname.trim();
  if (path.length === 0) {
    return "/";
  }
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }
  if (path.endsWith(".md")) {
    path = path.slice(0, -3);
  }
  if (path === "/index" || path === "") {
    return "/";
  }
  return path;
}

export function markdownForPath(pathname: string): MarkdownPage {
  const path = normalizeContentPath(pathname);
  const body = PAGES[path] ?? PAGES[path.toLowerCase()];
  if (body !== undefined) {
    return { status: 200, body };
  }
  return { status: 404, body: NOT_FOUND_MARKDOWN };
}

export function isNegotiablePath(pathname: string): boolean {
  const path = normalizeContentPath(pathname);
  if (path.startsWith("/.well-known/")) {
    return path === "/.well-known/agent-skills/agentscan/skill";
  }
  if (path === "/sitemap.xml" || path === "/robots.txt") {
    return false;
  }
  if (path.includes("opengraph-image") || path.includes("twitter-image")) {
    return false;
  }
  return true;
}

export function markdownResponse(
  body: string,
  status = 200,
): Response {
  const headers = new Headers({
    "Content-Type": "text/markdown; charset=utf-8",
    Vary: "Accept",
    "Cache-Control":
      status >= 400 ? "no-store" : "public, max-age=300, must-revalidate",
    Link: `<${absoluteUrl("/llms.txt")}>; rel="describedby"`,
  });
  return new Response(body, { status, headers });
}

export function notAcceptableResponse(): Response {
  return new Response(
    "Not Acceptable\n\nAvailable: text/html, text/markdown\n",
    {
      status: 406,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        Vary: "Accept",
      },
    },
  );
}
