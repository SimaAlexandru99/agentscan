import Link from "next/link";

import { SiteFooter } from "@/components/site-footer";
import { absoluteUrl } from "@/lib/site";

export default function NotFound() {
  return (
    <>
      <article className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Not found
        </h1>
        <p className="mt-4 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
          This path does not exist on agentscan.space. HTTP 404 — the resource
          is not here.
        </p>
        <p className="mt-8 text-foreground">Where to look next:</p>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">
          <li>
            <Link
              href="/docs"
              className="text-primary underline-offset-4 hover:underline"
            >
              Docs
            </Link>
          </li>
          <li>
            <a
              href="/llms.txt"
              className="text-primary underline-offset-4 hover:underline"
            >
              llms.txt
            </a>
          </li>
          <li>
            <a
              href="/sitemap.xml"
              className="text-primary underline-offset-4 hover:underline"
            >
              Sitemap
            </a>
          </li>
          <li>
            <Link
              href="/"
              className="text-primary underline-offset-4 hover:underline"
            >
              Home
            </Link>
          </li>
        </ul>
        <pre className="mt-10 overflow-x-auto rounded-xl border border-border bg-muted/30 p-4 font-mono text-sm leading-relaxed text-muted-foreground">
          {`# Not found

This path does not exist on agentscan.space.

- [Docs](${absoluteUrl("/docs")})
- [llms.txt](${absoluteUrl("/llms.txt")})
- [Sitemap](${absoluteUrl("/sitemap.xml")})`}
        </pre>
      </article>
      <SiteFooter />
    </>
  );
}
