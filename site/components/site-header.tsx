import Link from "next/link";

import { SiteNav } from "@/components/site-nav";

export function SiteHeader() {
  return (
    <header className="border-b border-border/60">
      <div className="mx-auto flex min-h-14 max-w-5xl flex-wrap items-center justify-between gap-x-4 px-6 py-2">
        <Link
          href="/"
          className="font-semibold tracking-tight text-foreground transition-opacity hover:opacity-80"
        >
          agentscan
        </Link>
        <SiteNav />
      </div>
    </header>
  );
}
