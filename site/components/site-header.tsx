import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const links = [
  { href: "/docs", label: "Docs" },
  {
    href: "https://github.com/SimaAlexandru99/agentscan",
    label: "GitHub",
    external: true,
  },
  {
    href: "https://www.npmjs.com/package/@chimix/agentscan",
    label: "npm",
    external: true,
  },
] as const;

export function SiteHeader() {
  return (
    <header className="border-b border-border/60">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-6">
        <Link
          href="/"
          className="font-semibold tracking-tight text-foreground transition-opacity hover:opacity-80"
        >
          agentscan
        </Link>
        <nav className="flex items-center gap-1">
          {links.map((link) => {
            const className = cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "rounded-full px-3",
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
