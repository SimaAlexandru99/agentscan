import Link from "next/link";

import { PRODUCT_VERSION } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 px-6 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>
          <span className="text-foreground">agentscan</span>
          {" · "}
          {PRODUCT_VERSION}
          {" · "}
          MIT
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <Link href="/docs" className="transition-colors hover:text-foreground">
            Docs
          </Link>
          <Link href="/about" className="transition-colors hover:text-foreground">
            About
          </Link>
          <Link
            href="/contact"
            className="transition-colors hover:text-foreground"
          >
            Contact
          </Link>
          <Link
            href="/privacy"
            className="transition-colors hover:text-foreground"
          >
            Privacy
          </Link>
          <a
            href="https://github.com/SimaAlexandru99/agentscan"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-foreground"
          >
            GitHub
          </a>
          <a
            href="https://www.npmjs.com/package/@chimix/agentscan"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-foreground"
          >
            npm
          </a>
        </div>
      </div>
    </footer>
  );
}
