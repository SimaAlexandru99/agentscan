import type { Metadata } from "next";
import Link from "next/link";

import { ChecksFilter } from "@/components/checks-filter";
import { JsonLd } from "@/components/json-ld";
import { SiteFooter } from "@/components/site-footer";
import {
  CHECK_FAMILIES,
  CITED_CHECKS,
  checkFamily,
  checks,
  PROVENANCE_SPLIT,
  SYMPTOMS,
} from "@/lib/checks";
import { breadcrumbJsonLd, itemListJsonLd } from "@/lib/json-ld";
import { cn } from "@/lib/utils";
import { absoluteUrl, PRODUCT_VERSION, socialMetadata } from "@/lib/site";

const TITLE = `All ${checks.length} agentscan checks`;
const DESCRIPTION = `Every rule agentscan ${PRODUCT_VERSION} can raise: id, severity, provenance, and source. ${CITED_CHECKS} of ${checks.length} checks cite a vendor docs page. Filter by agent.`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: "/checks",
    types: { "text/markdown": "/checks.md" },
  },
  ...socialMetadata(TITLE, DESCRIPTION, "/checks"),
};

function severityClass(severity: string): string {
  const top = severity.split("/")[0];
  if (top === "error") return "bg-primary text-primary-foreground";
  if (top === "warning") return "bg-primary/15 text-primary";
  return "bg-foreground/10 text-foreground/85";
}

export default function ChecksPage() {
  const max = Math.max(1, ...PROVENANCE_SPLIT.map((p) => p.count));
  return (
    <>
      <JsonLd
        data={itemListJsonLd(
          TITLE,
          checks.map((check) => ({ name: check.id, url: absoluteUrl(`/checks#${check.id}`) })),
        )}
      />
      <JsonLd data={breadcrumbJsonLd("Checks", "/checks")} />
      <article className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          {TITLE}
        </h1>
        <p className="mt-4 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground">
          Every rule agentscan {PRODUCT_VERSION} can raise, where it comes from, and how loud it
          is. {CITED_CHECKS} of {checks.length} cite a vendor docs page captured in docs/spec/; a
          heuristic says so and stays at info. To run them, see the{" "}
          <Link href="/docs" className="text-primary underline-offset-4 hover:underline">
            agentscan quickstart
          </Link>
          ; for what each release added, read the{" "}
          <Link href="/changelog" className="text-primary underline-offset-4 hover:underline">
            agentscan changelog
          </Link>
          .
        </p>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          Common symptoms:{" "}
          {SYMPTOMS.map(([text, id], index) => (
            <span key={id}>
              {index > 0 ? " · " : null}
              <a href={`#${id}`} className="text-primary underline-offset-4 hover:underline">
                {text}
              </a>
            </span>
          ))}
        </p>

        <section
          aria-label="Where the rules come from"
          className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-5"
        >
          {PROVENANCE_SPLIT.map((part) => (
            <div key={part.provenance} className="flex flex-col gap-2">
              <span className="text-3xl font-semibold tracking-tight">{part.count}</span>
              <div className="h-1 overflow-hidden rounded-full bg-foreground/10">
                <div
                  className={cn(
                    "bar-grow h-full rounded-full",
                    part.provenance === "spec-required" ? "bg-primary" : "bg-foreground/45",
                  )}
                  style={{ width: `${Math.round((part.count / max) * 100)}%` }}
                />
              </div>
              <span className="text-sm text-muted-foreground">{part.label}</span>
            </div>
          ))}
        </section>

        <ChecksFilter families={CHECK_FAMILIES} total={checks.length}>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <thead>
                <tr className="text-left font-mono text-xs text-muted-foreground">
                  <th scope="col" className="px-4 py-3.5 font-medium">Rule id</th>
                  <th scope="col" className="px-3 py-3.5 font-medium">Severity</th>
                  <th scope="col" className="px-3 py-3.5 font-medium">Provenance</th>
                  <th scope="col" className="px-3 py-3.5 font-medium">What it catches</th>
                  <th scope="col" className="px-4 py-3.5 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {checks.map((check) => (
                  <tr
                    key={check.id}
                    id={check.id}
                    data-family={checkFamily(check.id)}
                    data-severity={check.severity}
                    className="check-row scroll-mt-20 border-t border-border/60 align-top target:bg-primary/10"
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-[13px] text-foreground">
                      <a href={`#${check.id}`} className="hover:text-primary">
                        {check.id}
                      </a>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={cn(
                          "rounded-md px-2 py-0.5 font-mono text-xs",
                          severityClass(check.severity),
                        )}
                      >
                        {check.severity}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                      {check.provenance}
                    </td>
                    <td className="px-3 py-3 leading-relaxed text-foreground/85">
                      {check.description}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[13px]">
                      {check.sourceUrl ? (
                        <a
                          href={check.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          {new URL(check.sourceUrl).host}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">agentscan inference</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChecksFilter>
        <p className="mt-6 text-sm text-muted-foreground">
          Generated from the rule registry of agentscan {PRODUCT_VERSION}.
        </p>
      </article>
      <SiteFooter />
    </>
  );
}
