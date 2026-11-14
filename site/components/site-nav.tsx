"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { GITHUB_REPO } from "@/lib/links";
import { cn } from "@/lib/utils";

const links = [
  { href: "/checks", label: "Checks" },
  { href: "/results", label: "Results" },
  { href: "/changelog", label: "Changelog" },
  { href: "/docs", label: "Docs" },
] as const;

/** Client only for `aria-current`; the links render on the server as well. */
export function SiteNav() {
  const pathname = usePathname();
  const className = cn(buttonVariants({ variant: "ghost", size: "sm" }), "rounded-full px-2.5");

  return (
    <nav aria-label="Primary" className="-mr-2 flex flex-wrap items-center">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={pathname === link.href ? "page" : undefined}
          className={cn(className, "aria-[current=page]:text-primary")}
        >
          {link.label}
        </Link>
      ))}
      <a href={GITHUB_REPO} target="_blank" rel="noopener noreferrer" className={className}>
        GitHub
      </a>
    </nav>
  );
}
