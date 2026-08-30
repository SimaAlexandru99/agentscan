import type { ReactNode } from "react";

import { SiteFooter } from "@/components/site-footer";

export function ArticleLayout({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <>
      <article className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {title}
        </h1>
        <div className="mt-6 space-y-4 text-pretty text-base leading-relaxed text-muted-foreground">
          {children}
        </div>
      </article>
      <SiteFooter />
    </>
  );
}
