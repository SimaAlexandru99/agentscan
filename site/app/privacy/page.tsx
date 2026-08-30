import type { Metadata } from "next";

import { ArticleLayout } from "@/components/article-layout";
import {
  GITHUB_ISSUES,
  NPM_PACKAGE,
  PRODUCT_VERSION,
  SITE_ORIGIN,
} from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: "Privacy — agentscan" },
  description:
    "Privacy notes for agentscan.space and the local @chimix/agentscan CLI. No accounts on this site.",
  alternates: {
    canonical: "/privacy",
    types: { "text/markdown": "/privacy.md" },
  },
  openGraph: {
    title: "Privacy — agentscan",
    url: "/privacy",
    type: "website",
  },
};

export default function PrivacyPage() {
  return (
    <ArticleLayout title="Privacy — agentscan">
      <p>
        This page describes the public website {SITE_ORIGIN} and the local CLI{" "}
        <code className="font-mono text-foreground">{NPM_PACKAGE}</code>. It is
        not legal advice. It does not invent analytics vendors, DSNs, or contact
        details that are not already public for this project.
      </p>
      <p>
        The website is a static marketing and documentation site. It does not
        create accounts, accept payments, or host a scanner that uploads your
        repository. There is no sign-in form and no newsletter form on these
        pages. We do not ask for your email address here.
      </p>
      <p>
        The product you install is a local process. On{" "}
        <code className="font-mono text-foreground">check</code>, agentscan{" "}
        {PRODUCT_VERSION} reads files on the machine where you run it, compares
        config to disk, and prints findings. It writes nothing to the scanned
        tree and does not open a network connection. Your agent configs,
        lockfiles, and secrets stay on your computer unless you choose to paste
        them somewhere else (for example into a GitHub issue). Do not paste
        secrets into issues.
      </p>
      <p>
        Hosting the website may produce ordinary HTTP access logs at the host
        (the site is deployed as a Next.js app on Vercel, as documented in the
        site README). This project does not add a third-party marketing pixel or
        an application database of visitors. We do not sell visitor data; there
        is no visitor product.
      </p>
      <p>
        If you file an issue on GitHub, GitHub&apos;s privacy policy applies to
        that content. The npm registry&apos;s policy applies to installs of{" "}
        <code className="font-mono text-foreground">{NPM_PACKAGE}</code>.
      </p>
      <p>
        Questions about this page: open a GitHub issue at{" "}
        <a
          href={GITHUB_ISSUES}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline-offset-4 hover:underline"
        >
          {GITHUB_ISSUES}
        </a>
        .
      </p>
    </ArticleLayout>
  );
}
