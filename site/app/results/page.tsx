import type { Metadata } from "next";
import Link from "next/link";

import { JsonLd } from "@/components/json-ld";
import { SiteFooter } from "@/components/site-footer";
import { breadcrumbJsonLd } from "@/lib/json-ld";
import {
  ERRORS_LINE,
  FINDINGS_AFTER,
  FINDINGS_BEFORE,
  RESULT_CASES,
  RESULT_LESSONS,
  RESULTS_CTA,
  RESULTS_CTA_COMMAND,
  RESULTS_FOOTNOTE,
  RESULTS_H1,
  RESULTS_INTRO,
  RESULTS_LEFT_ALONE,
  RESULTS_LESSONS_INTRO,
  RESULTS_SUMMARY,
  RESULTS_TITLE,
} from "@/lib/results";
import { cn } from "@/lib/utils";

const DESCRIPTION =
  "Ten real config problems agentscan found on four machines and 29 projects, nine fixed the same day, and the false alarms the run removed from agentscan.";

export const metadata: Metadata = {
  title: RESULTS_TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: "/results",
    types: { "text/markdown": "/results.md" },
  },
  openGraph: { title: RESULTS_TITLE, description: DESCRIPTION, url: "/results", type: "article" },
  twitter: { card: "summary_large_image", title: RESULTS_TITLE, description: DESCRIPTION },
};

export default function ResultsPage() {
  return (
    <>
      <JsonLd data={breadcrumbJsonLd("Results", "/results")} />
      <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl">
          {RESULTS_H1}
        </h1>
        <p className="mt-5 max-w-3xl text-pretty text-lg leading-relaxed text-muted-foreground">
          {RESULTS_INTRO}
        </p>

        <section
          aria-label="Summary"
          className="mt-10 flex flex-wrap gap-x-12 gap-y-6 border-y border-border py-6"
        >
          {RESULTS_SUMMARY.map((item) => (
            <div key={item.label}>
              <span className="block text-4xl font-semibold tracking-tight text-foreground">
                {item.value}
              </span>
              <span className="text-[15px] text-muted-foreground">{item.label}</span>
            </div>
          ))}
        </section>

        <section className="mt-18">
          <h2 className="mb-6 text-3xl font-semibold tracking-tight text-foreground">
            The problems, one by one
          </h2>
          <div className="border-t border-border">
            {RESULT_CASES.map((item, index) => (
              <article
                key={item.title}
                className="rise grid grid-cols-1 items-baseline gap-3 border-b border-border py-6 md:grid-cols-[64px_minmax(0,1.3fr)_minmax(0,1fr)_120px] md:gap-6"
                style={{ animationDelay: `${index * 70}ms` }}
              >
                <span className="text-3xl font-semibold text-foreground">{item.count}</span>
                <div>
                  <h3 className="text-lg font-semibold leading-snug text-foreground">{item.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{item.why}</p>
                </div>
                <div>
                  <Link
                    href={`/checks#${item.rule}`}
                    className="font-mono text-[13px] text-primary underline-offset-4 hover:underline"
                  >
                    {item.rule}
                  </Link>
                  <p className="mt-2 text-[15px] leading-relaxed text-foreground/85">{item.action}</p>
                </div>
                <span
                  className={cn(
                    "justify-self-start rounded-full px-2.5 py-1 font-mono text-xs",
                    item.state === "fixed"
                      ? "bg-primary/15 text-primary"
                      : "bg-foreground/10 text-foreground/85",
                  )}
                >
                  {item.state}
                </span>
              </article>
            ))}
          </div>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{RESULTS_LEFT_ALONE}</p>
        </section>

        <section className="mt-24">
          <h2 className="mb-3 text-3xl font-semibold tracking-tight text-foreground">
            What the run taught us about agentscan
          </h2>
          <p className="mb-8 max-w-3xl leading-relaxed text-muted-foreground">
            {RESULTS_LESSONS_INTRO}
          </p>
          <div className="flex max-w-3xl flex-col gap-3.5">
            <div>
              <div className="mb-1.5 flex justify-between font-mono text-[13px] text-muted-foreground">
                <span>findings on one home directory</span>
                <span>
                  {FINDINGS_BEFORE} → {FINDINGS_AFTER}
                </span>
              </div>
              <div className="h-3.5 overflow-hidden rounded-full bg-foreground/5">
                <div
                  className="bar-shrink h-full rounded-full bg-primary"
                  style={{ transform: `scaleX(${FINDINGS_AFTER / FINDINGS_BEFORE})` }}
                />
              </div>
            </div>
            <p className="font-mono text-[13px] text-muted-foreground">{ERRORS_LINE}</p>
          </div>
          <ul className="mt-8 flex max-w-4xl flex-col gap-3 leading-relaxed text-foreground/85">
            {RESULT_LESSONS.map((lesson) => (
              <li key={lesson} className="border-l-2 border-border pl-4">
                {lesson}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-24 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-black/30 p-7">
          <p className="text-[17px] text-foreground/85">{RESULTS_CTA}</p>
          <code className="inline-flex min-h-12 items-center rounded-full bg-primary px-5 font-mono text-[15px] text-primary-foreground">
            {RESULTS_CTA_COMMAND}
          </code>
        </section>

        <p className="mt-10 text-[13px] text-muted-foreground">
          {RESULTS_FOOTNOTE} Every rule named here is listed on{" "}
          <Link href="/checks" className="text-primary underline-offset-4 hover:underline">
            all agentscan checks
          </Link>
          .
        </p>
      </div>
      <SiteFooter />
    </>
  );
}
