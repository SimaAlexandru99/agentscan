import type { Metadata } from "next";
import Link from "next/link";

import { InlineCode } from "@/components/inline-code";
import { JsonLd } from "@/components/json-ld";
import { SiteFooter } from "@/components/site-footer";
import { breadcrumbJsonLd, itemListJsonLd } from "@/lib/json-ld";
import { NPM_NOTE, releases } from "@/lib/releases";
import { absoluteUrl, GITHUB_REPO, PRODUCT_VERSION, socialMetadata } from "@/lib/site";

const TITLE = "agentscan changelog";
const DESCRIPTION = `Every agentscan release from ${releases.at(-1)?.version} to ${PRODUCT_VERSION}, newest first: new agents, new checks, and fixes. The check path stays offline in each.`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: "/changelog",
    types: { "text/markdown": "/changelog.md" },
  },
  ...socialMetadata(TITLE, DESCRIPTION, "/changelog"),
};

export default function ChangelogPage() {
  return (
    <>
      <JsonLd
        data={itemListJsonLd(
          TITLE,
          releases.map((release) => ({
            name: `agentscan ${release.version}`,
            url: absoluteUrl(`/changelog#v${release.version}`),
          })),
        )}
      />
      <JsonLd data={breadcrumbJsonLd("Changelog", "/changelog")} />
      <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
        <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          {TITLE}
        </h1>
        <p className="mt-4 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground">
          Every release, newest first. The check path stays offline and read-only in each one.{" "}
          {NPM_NOTE} The rules each release ships are listed on{" "}
          <Link href="/checks" className="text-primary underline-offset-4 hover:underline">
            all agentscan checks
          </Link>
          .
        </p>

        <ol className="mt-14 list-none p-0">
          {releases.map((release, index) => (
            <li
              key={release.version}
              className="rise border-t border-border py-9"
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <article
                id={`v${release.version}`}
                className="grid scroll-mt-20 grid-cols-1 gap-6 md:grid-cols-[220px_minmax(0,1fr)] md:gap-10"
              >
                <div className="flex flex-col gap-2">
                  <h2 className="font-mono text-2xl font-medium text-primary">
                    <a href={`#v${release.version}`}>{release.version}</a>
                  </h2>
                  <time dateTime={release.date} className="font-mono text-[13px] text-muted-foreground">
                    {release.date}
                  </time>
                  {release.version === PRODUCT_VERSION ? (
                    <span className="self-start rounded-full border border-primary/50 px-2.5 py-0.5 text-xs text-primary">
                      latest on npm
                    </span>
                  ) : null}
                  {release.breaking ? (
                    <span className="self-start rounded-full border border-primary/50 px-2.5 py-0.5 text-xs text-primary">
                      breaking
                    </span>
                  ) : null}
                </div>
                <div>
                  {release.summary ? (
                    <p className="max-w-3xl leading-relaxed text-muted-foreground">
                      <InlineCode text={release.summary} />
                    </p>
                  ) : null}
                  {release.items.length > 0 ? (
                    <ul className="mt-4 flex max-w-3xl list-none flex-col gap-2 p-0 text-[15px] leading-relaxed text-foreground/85 first:mt-0">
                      {release.items.map((item) => (
                        <li key={item} className="border-l-2 border-border pl-4">
                          <InlineCode text={item} />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </article>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-[15px]">
          <a
            href={`${GITHUB_REPO}/blob/master/CHANGELOG.md`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline-offset-4 hover:underline"
          >
            Releases before {releases.at(-1)?.version} in CHANGELOG.md
          </a>
        </p>
      </div>
      <SiteFooter />
    </>
  );
}
