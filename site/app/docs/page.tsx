import type { Metadata } from "next";
import Link from "next/link";

import { SiteFooter } from "@/components/site-footer";
import { PRODUCT_CHECKS, PRODUCT_VERSION } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: `agentscan docs — ${PRODUCT_VERSION}, ${PRODUCT_CHECKS} checks` },
  description:
    `Quickstart, check flags, and CI for agentscan ${PRODUCT_VERSION} (${PRODUCT_CHECKS} checks).`,
  alternates: {
    canonical: "/docs",
    types: { "text/markdown": "/docs.md" },
  },
  openGraph: {
    title: "agentscan docs",
    url: "/docs",
    type: "website",
  },
};

const flags = [
  {
    flag: "--json",
    meaning: "JSON report (alias for --output json)",
  },
  {
    flag: "--output <format>",
    meaning: "human (default) · json · prompt",
  },
  {
    flag: "--copy",
    meaning: "Also copy the report to the system clipboard",
  },
  {
    flag: "--no-color",
    meaning: "Never colour, even on a terminal (NO_COLOR=1 does the same)",
  },
  {
    flag: "--quiet",
    meaning: "Summary line only",
  },
  {
    flag: "--verbose",
    meaning: "Show KEEP + info-severity findings, and print each finding's id",
  },
  {
    flag: "--fail-on <level>",
    meaning: "never (default) · warning · error",
  },
  {
    flag: "--fail-under <0-100>",
    meaning: "Fail when the score drops below this floor",
  },
  {
    flag: "--global",
    meaning: "Also scan ~/.claude/skills, ~/.codex/skills, ~/.commandcode/skills, and ~/.agents/skills",
  },
  {
    flag: "--config <path>",
    meaning: "Config file path",
  },
] as const;

export default function DocsPage() {
  return (
    <>
      <article className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          agentscan docs
        </h1>
        <p className="mt-4 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
          agentscan {PRODUCT_VERSION} audits agent configuration on disk —{" "}
          {PRODUCT_CHECKS} checks.
          Scans are read-only and never open a network connection. Spec-required
          checks cite a published spec line; heuristics stay at info and are
          labeled. Full behavior lives in the{" "}
          <a
            href="https://github.com/SimaAlexandru99/agentscan#readme"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline-offset-4 hover:underline"
          >
            README
          </a>
          .
        </p>

        <section className="mt-14">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            Quickstart
          </h2>
          <p className="mt-3 text-muted-foreground">
            Run against any project. It reads that project, writes nothing, and
            never leaves your machine.
          </p>

          <h3 className="mt-8 font-medium text-foreground">npx</h3>
          <pre className="mt-3 overflow-x-auto rounded-xl border border-border bg-muted/30 p-4 font-mono text-sm leading-relaxed">
            {`cd ~/your-project
npx @chimix/agentscan@latest
# or explicitly:
npx @chimix/agentscan check`}
          </pre>

          <h3 className="mt-8 font-medium text-foreground">bunx</h3>
          <pre className="mt-3 overflow-x-auto rounded-xl border border-border bg-muted/30 p-4 font-mono text-sm leading-relaxed">
            {`bunx --bun @chimix/agentscan
# or after install:
bun add -d @chimix/agentscan
bunx agentscan check`}
          </pre>

          <h3 className="mt-8 font-medium text-foreground">From a checkout</h3>
          <pre className="mt-3 overflow-x-auto rounded-xl border border-border bg-muted/30 p-4 font-mono text-sm leading-relaxed">
            {`git clone --depth=1 https://github.com/SimaAlexandru99/agentscan
cd agentscan && bun install
bun run src/cli.ts check ~/your-project`}
          </pre>

          <p className="mt-4 text-sm text-muted-foreground">
            The package is scoped{" "}
            <code className="font-mono text-foreground">@chimix/agentscan</code>{" "}
            because npm rejects the bare name. The command you type stays{" "}
            <code className="font-mono text-foreground">agentscan</code>.
          </p>
        </section>

        <section className="mt-14">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            Flags for <code className="font-mono">check</code>
          </h2>
          <div className="mt-6 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead className="border-b border-border bg-muted/30 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Flag</th>
                  <th className="px-4 py-3 font-medium">Meaning</th>
                </tr>
              </thead>
              <tbody>
                {flags.map((row) => (
                  <tr
                    key={row.flag}
                    className="border-b border-border/70 last:border-0"
                  >
                    <td className="px-4 py-3 align-top font-mono text-foreground">
                      {row.flag}
                    </td>
                    <td className="px-4 py-3 align-top text-muted-foreground">
                      {row.meaning}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            v1 does not write the tree — no apply, no skill delete/install.
            Findings may suggest shell commands; you run them yourself.
          </p>
        </section>

        <section className="mt-14">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            Skill
          </h2>
          <p className="mt-3 text-muted-foreground">
            Agents forget the audit. Copy{" "}
            <code className="font-mono text-foreground">skills/agentscan</code>{" "}
            into the project so they run it before editing hooks or claiming a
            guard is on.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-xl border border-border bg-muted/30 p-4 font-mono text-sm leading-relaxed">
            {`cp -R skills/agentscan .cursor/skills/agentscan
# or: .agents/skills/agentscan
# or: .claude/skills/agentscan`}
          </pre>

          <h3 className="mt-8 font-medium text-foreground">When</h3>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">
            <li>Hook, skill, MCP, or AGENTS.md work</li>
            <li>Someone says a guard is on and you have not verified the script</li>
            <li>
              A PR touches{" "}
              <code className="font-mono text-foreground">.claude/</code>,{" "}
              <code className="font-mono text-foreground">.agents/</code>,{" "}
              <code className="font-mono text-foreground">.mcp.json</code>, or{" "}
              <code className="font-mono text-foreground">skills-lock.json</code>
            </li>
          </ul>

          <h3 className="mt-8 font-medium text-foreground">Do</h3>
          <p className="mt-3 text-muted-foreground">
            From the repo root. Findings are facts. Do not skip{" "}
            <code className="font-mono text-foreground">
              claude.hook.missing-script
            </code>{" "}
            (error).
          </p>
          <pre className="mt-3 overflow-x-auto rounded-xl border border-border bg-muted/30 p-4 font-mono text-sm leading-relaxed">
            {`npx @chimix/agentscan@latest --output prompt`}
          </pre>
          <p className="mt-4 text-muted-foreground">
            No project handy —{" "}
            <code className="font-mono text-foreground">demo</code> builds a
            throwaway fixture, prints the report, and deletes it:
          </p>
          <pre className="mt-3 overflow-x-auto rounded-xl border border-border bg-muted/30 p-4 font-mono text-sm leading-relaxed">
            {`npx @chimix/agentscan@latest demo`}
          </pre>

          <h3 className="mt-8 font-medium text-foreground">Don&apos;t</h3>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">
            <li>Write the scanned tree</li>
            <li>Guess with the model whether a hook is valid</li>
            <li>
              Compare a skill&apos;s frontmatter{" "}
              <code className="font-mono text-foreground">name</code> to its
              directory, or validate model ids
            </li>
          </ul>
        </section>

        <section className="mt-14">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            CI
          </h2>
          <p className="mt-3 text-muted-foreground">
            The Action runs from its own checkout, so it uses the ref you pin
            rather than whatever is on npm:
          </p>
          <pre className="mt-4 overflow-x-auto rounded-xl border border-border bg-muted/30 p-4 font-mono text-sm leading-relaxed">
            {`- uses: SimaAlexandru99/agentscan@v1
  with:
    fail-on: error        # never | warning | error
    output: human         # human | json | prompt`}
          </pre>
          <p className="mt-6 text-muted-foreground">Or run it directly:</p>
          <pre className="mt-3 overflow-x-auto rounded-xl border border-border bg-muted/30 p-4 font-mono text-sm leading-relaxed">
            {`- name: agentscan
  run: bunx agentscan check --fail-on error`}
          </pre>
          <p className="mt-4 text-sm text-muted-foreground">
            Default{" "}
            <code className="font-mono text-foreground">failOn</code> is{" "}
            <code className="font-mono text-foreground">never</code> so local
            runs stay non-blocking until you opt in.
          </p>
        </section>

        <p className="mt-14 text-sm text-muted-foreground">
          <Link
            href="/"
            className="text-primary underline-offset-4 hover:underline"
          >
            ← Back to agentscan
          </Link>
        </p>
      </article>
      <SiteFooter />
    </>
  );
}
