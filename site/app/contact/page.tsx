import type { Metadata } from "next";

import { ArticleLayout } from "@/components/article-layout";
import {
  CHECK_COMMAND,
  GITHUB_ISSUES,
  GITHUB_REPO,
  NPM_PACKAGE,
  NPM_URL,
  PRODUCT_VERSION,
  RUN_COMMAND,
} from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: "Contact agentscan" },
  description:
    "Contact agentscan through GitHub issues or the npm package page. No phone number.",
  alternates: {
    canonical: "/contact",
    types: { "text/markdown": "/contact.md" },
  },
  openGraph: {
    title: "Contact agentscan",
    url: "/contact",
    type: "website",
  },
};

export default function ContactPage() {
  return (
    <ArticleLayout title="Contact agentscan">
      <p>
        agentscan is an open-source CLI. There is no sales phone number, no
        support mailbox invented for this page, and no ticket form on this site.
      </p>
      <p>Public contact for the project:</p>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          GitHub issues and discussion:{" "}
          <a
            href={GITHUB_ISSUES}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline-offset-4 hover:underline"
          >
            {GITHUB_ISSUES}
          </a>
        </li>
        <li>
          Source repository:{" "}
          <a
            href={GITHUB_REPO}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline-offset-4 hover:underline"
          >
            {GITHUB_REPO}
          </a>
        </li>
        <li>
          Published package:{" "}
          <a
            href={NPM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline-offset-4 hover:underline"
          >
            {NPM_URL}
          </a>{" "}
          (<code className="font-mono text-foreground">{NPM_PACKAGE}</code>{" "}
          {PRODUCT_VERSION})
        </li>
      </ul>
      <p>
        Use GitHub issues for bugs, false findings, spec questions, and docs
        mistakes. Include the command you ran (
        <code className="font-mono text-foreground">{RUN_COMMAND}</code> or{" "}
        <code className="font-mono text-foreground">{CHECK_COMMAND}</code>),
        the agentscan version, and a redacted snippet of the config you scanned.
        Do not paste secrets, tokens, or{" "}
        <code className="font-mono text-foreground">.env</code> contents into an
        issue.
      </p>
      <p>
        The CLI itself does not phone home. A local{" "}
        <code className="font-mono text-foreground">check</code> does not open a
        socket, so running the tool does not create a support session and does
        not register you anywhere. If you want a change in the product, the
        reviewable path is a GitHub issue or a pull request on the public
        repository.
      </p>
      <p>
        This page is the contact path for agentscan.space. It does not list a
        street address, a company switchboard, or a personal phone number
        because those are not published contact methods for this product.
      </p>
    </ArticleLayout>
  );
}
