import type { Metadata } from "next";
import Link from "next/link";

import { ArticleLayout } from "@/components/article-layout";
import {
  GITHUB_REPO,
  NPM_PACKAGE,
  PRODUCT_CHECKS,
  PRODUCT_VERSION,
  RUN_COMMAND,
} from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: `About agentscan — ${PRODUCT_VERSION}` },
  description: `agentscan ${PRODUCT_VERSION} is a local CLI that audits agent configuration. ${PRODUCT_CHECKS} checks. Offline on check.`,
  alternates: {
    canonical: "/about",
    types: { "text/markdown": "/about.md" },
  },
  openGraph: {
    title: "About agentscan",
    url: "/about",
    type: "website",
  },
};

export default function AboutPage() {
  return (
    <ArticleLayout title="About agentscan">
      <p>
        agentscan is a local command-line linter for agent configuration.{" "}
        {PRODUCT_VERSION} ships {PRODUCT_CHECKS} checks. It reads skills,{" "}
        <code className="font-mono text-foreground">skills-lock.json</code>,
        hooks, MCP server configs, agent definitions, and instruction files such
        as <code className="font-mono text-foreground">AGENTS.md</code>, then
        reports where the config disagrees with the disk.
      </p>
      <p>
        It exists for a specific failure: a hook still registered after its
        script was deleted. The agent starts. Nothing in the editor, the
        runtime, or a normal test suite tells you the guard is gone. agentscan
        compares the config to the filesystem and prints the miss as{" "}
        <code className="font-mono text-foreground">
          claude.hook.missing-script
        </code>{" "}
        at error.
      </p>
      <p>
        The product is the published npm package{" "}
        <code className="font-mono text-foreground">{NPM_PACKAGE}</code> (the
        bare name was rejected as too close to an unrelated package). The
        command you type is <code className="font-mono text-foreground">agentscan</code>.
        Run it with{" "}
        <code className="font-mono text-foreground">{RUN_COMMAND}</code> on Node
        20.11+ or Bun. Scans are read-only: they do not write the tree they scan
        and they do not open a network connection.
      </p>
      <p>
        An earlier build reported 37 findings across 17 real projects of which
        25 were false, because two checks were written from what projects
        happened to look like instead of from a published spec line. Those
        checks were deleted. Spec-required checks now cite a line in{" "}
        <a
          href={`${GITHUB_REPO}/tree/master/docs/spec`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline-offset-4 hover:underline"
        >
          docs/spec/
        </a>
        . Heuristics stay at info and are labeled. 1.0.0 was the
        first stable release. {PRODUCT_VERSION} ships {PRODUCT_CHECKS} checks.
      </p>
      <p>
        This website is the public marketing and docs surface for that CLI. It
        is not a hosted scanner, not a SaaS dashboard, and not a different
        company&apos;s product. There is no account system on this origin.
      </p>
      <p>
        Source:{" "}
        <a
          href={GITHUB_REPO}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline-offset-4 hover:underline"
        >
          {GITHUB_REPO}
        </a>
        . License: MIT.{" "}
        <Link href="/docs" className="text-primary underline-offset-4 hover:underline">
          Read the docs
        </Link>
        .
      </p>
    </ArticleLayout>
  );
}
