import type { Metadata } from "next";
import Link from "next/link";

import { AgentSelector } from "@/components/agent-selector";
import { ConfigDiskExplainer } from "@/components/config-disk-explainer";
import { CopyCommand } from "@/components/copy-command";
import { InlineCode } from "@/components/inline-code";
import { SoftwareApplicationJsonLd } from "@/components/json-ld";
import { SiteFooter } from "@/components/site-footer";
import { buttonVariants } from "@/components/ui/button";
import { BENEFITS, HOME_METRICS, OTHER_AGENTS, RUNS_NOTE } from "@/lib/home";
import { releases } from "@/lib/releases";
import {
  BREAKING_NOTE,
  HOME_DESCRIPTION,
  HOME_TITLE,
  PRODUCT_CHECKS,
  PRODUCT_VERSION,
  socialMetadata,
  SUPPORTED_AGENTS,
} from "@/lib/site";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: { absolute: HOME_TITLE },
  description: HOME_DESCRIPTION,
  alternates: {
    canonical: "/",
    types: { "text/markdown": "/index.md" },
  },
  ...socialMetadata(HOME_TITLE, HOME_DESCRIPTION, "/"),
};

const h2 = "text-3xl font-semibold tracking-tight text-foreground sm:text-4xl";
const textLink = "text-[15px] text-primary underline-offset-4 hover:underline";

export default function HomePage() {
  return (
    <>
      <SoftwareApplicationJsonLd />
      <div className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,oklch(0.795_0.184_86.047_/0.12),transparent_55%),linear-gradient(180deg,oklch(0.14_0.02_91.936),transparent_40%)]"
        />
        <div className="relative mx-auto max-w-5xl px-6 pb-8 pt-16 sm:pt-24">
          <section className="max-w-3xl">
            <p className="rise text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">
              agentscan
            </p>
            <h1
              className="rise mt-5 text-balance text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl"
              style={{ animationDelay: "70ms" }}
            >
              Your agent config says the guard is on. The script is gone. Nothing
              told you.
            </h1>
            <p
              className="rise mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground"
              style={{ animationDelay: "140ms" }}
            >
              Linters read the code your agent writes. agentscan reads the agent
              itself, for {SUPPORTED_AGENTS.length} coding agents, and checks each config against the
              disk and the vendor&apos;s own docs. Offline, read-only,
              deterministic.
            </p>
            <div className="rise mt-7 space-y-4" style={{ animationDelay: "210ms" }}>
              <CopyCommand />
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/checks"
                  className={cn(buttonVariants({ variant: "outline", size: "lg" }), "rounded-full px-5")}
                >
                  Browse all {PRODUCT_CHECKS} checks
                </Link>
                <Link
                  href="/docs"
                  className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "rounded-full px-5")}
                >
                  Read the docs
                </Link>
              </div>
            </div>
            <p
              className="rise mt-4 font-mono text-sm text-muted-foreground"
              style={{ animationDelay: "280ms" }}
            >
              {PRODUCT_VERSION} · {PRODUCT_CHECKS} checks · offline on check
            </p>
          </section>

          <ConfigDiskExplainer />
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6">
        <section className="mt-24">
          <h2 className={h2}>What you get after one run</h2>
          <p className="mt-2 mb-9 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
            The failures agentscan finds are the ones nothing else reports: the
            agent starts normally and quietly skips what you configured.
          </p>
          <ol className="border-t border-border">
            {BENEFITS.map((benefit, index) => (
              <li
                key={benefit.title}
                className="grid grid-cols-1 items-baseline gap-2 border-b border-border py-6 md:grid-cols-[56px_minmax(0,1fr)_minmax(0,1.2fr)] md:gap-6"
              >
                <span className="font-mono text-[13px] text-primary">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="text-xl font-semibold leading-snug tracking-tight text-foreground">
                  {benefit.title}
                </h3>
                <p className="leading-relaxed text-muted-foreground">{benefit.body}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="border-t border-border/60">
        <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            Why the tool looks like this
          </h2>
          <p className="mt-4 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
            An earlier build reported 37 findings across 17 real projects of
            which <span className="text-foreground">25 were false</span> — two
            checks had been written from what real projects looked like instead
            of from the spec. Both were deleted. Spec-required checks cite a
            published line in docs/spec/.
            Heuristics stay at info and are labeled. 1.0.0 was the first stable release. {PRODUCT_VERSION} ships{" "}
            {PRODUCT_CHECKS} checks, still offline on check. {BREAKING_NOTE}
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-6 pb-24">
        <section aria-label="Results from real runs" className="mt-8">
          <div className="mb-7 flex flex-wrap items-baseline justify-between gap-4">
            <h2 className={h2}>From real runs</h2>
            <Link href="/results" className={textLink}>
              Every scenario from the real run, in detail
            </Link>
          </div>
          <dl className="grid grid-cols-2 border-y border-border md:grid-cols-4">
            {HOME_METRICS.map((metric) => (
              <div key={metric.label} className="flex flex-col-reverse justify-end gap-2 py-7 pr-6">
                <dt className="text-[15px] leading-normal text-muted-foreground">{metric.label}</dt>
                <dd className="whitespace-nowrap text-3xl font-semibold leading-none tracking-tight text-foreground sm:text-4xl">
                  {metric.value}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-3.5 text-[13px] text-muted-foreground">{RUNS_NOTE}</p>
        </section>

        <section id="agents" className="mt-24 scroll-mt-20">
          <h2 className={cn(h2, "mb-6")}>Pick your agent</h2>
          <AgentSelector />
          <p className="mt-3 text-[13px] text-muted-foreground">{OTHER_AGENTS}</p>
        </section>

        <section className="mt-24">
          <div className="mb-5 flex flex-wrap items-baseline justify-between gap-4">
            <h2 className={h2}>Latest releases</h2>
            <Link href="/changelog" className={textLink}>
              Full agentscan changelog
            </Link>
          </div>
          <ul className="border-t border-border">
            {releases.slice(0, 3).map((release) => (
              <li
                key={release.version}
                className="grid grid-cols-[72px_minmax(0,1fr)] items-baseline gap-x-4 gap-y-1 border-b border-border py-4 md:grid-cols-[96px_120px_minmax(0,1fr)]"
              >
                <Link
                  href={`/changelog#v${release.version}`}
                  className="font-mono text-base text-primary underline-offset-4 hover:underline"
                >
                  {release.version}
                </Link>
                <time dateTime={release.date} className="font-mono text-[13px] text-muted-foreground">
                  {release.date}
                </time>
                <p className="col-span-2 line-clamp-2 leading-relaxed text-foreground/85 md:col-span-1">
                  <InlineCode text={release.summary} />
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <SiteFooter />
    </>
  );
}
