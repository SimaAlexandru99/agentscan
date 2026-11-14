import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { GITHUB_REPO } from "@/lib/site";
import { cn } from "@/lib/utils";

// /results ships in stage 2 of the redesign.
const links = [
  { href: "/checks", label: "Checks" },
  { href: "/results", label: "Results" },
  { href: "/changelog", label: "Changelog" },
  { href: "/docs", label: "Docs" },
  { href: GITHUB_REPO, label: "GitHub", external: true },
] as const;

export function SiteHeader() {
  return (
    <header className="border-b border-border/60">
      <div className="mx-auto flex min-h-14 max-w-3xl flex-wrap items-center justify-between gap-x-4 px-6 py-2">
        <Link
          href="/"
          className="font-semibold tracking-tight text-foreground transition-opacity hover:opacity-80"
        >
          agentscan
        </Link>
        <nav aria-label="Primary" className="-mr-2 flex flex-wrap items-center">
          {links.map((link) => {
            const className = cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "rounded-full px-2.5",
            );

            if ("external" in link && link.external) {
              return (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={className}
                >
                  {link.label}
                </a>
              );
            }

            return (
              <Link key={link.href} href={link.href} className={className}>
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
