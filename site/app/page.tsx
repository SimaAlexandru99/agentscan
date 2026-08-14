import Link from "next/link";

import { CopyCommand } from "@/components/copy-command";
import { SiteFooter } from "@/components/site-footer";
import { TerminalDemo } from "@/components/terminal-demo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function HomePage() {
  return (
    <>
      <div className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,oklch(0.795_0.184_86.047_/0.12),transparent_55%),linear-gradient(180deg,oklch(0.14_0.02_91.936),transparent_40%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.035] [background-image:linear-gradient(oklch(1_0_0_/80%)_1px,transparent_1px),linear-gradient(90deg,oklch(1_0_0_/80%)_1px,transparent_1px)] [background-size:48px_48px]"
        />

        <section className="relative mx-auto max-w-3xl px-6 pb-16 pt-16 sm:pb-20 sm:pt-24">
          <p className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-700 text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">
            agentscan
          </p>
          <h1 className="animate-in fade-in slide-in-from-bottom-3 fill-mode-both delay-100 duration-700 mt-5 max-w-2xl text-balance text-xl font-medium leading-snug text-foreground/95 sm:text-2xl">
            Your agent config says the guard is on. The script is gone. Nothing
            told you.
          </h1>
          <p className="animate-in fade-in slide-in-from-bottom-3 fill-mode-both delay-200 duration-700 mt-4 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground">
            Linters read the code your agent writes. This reads the agent itself
            — skills, hooks, MCP servers, lockfiles, and policy files.
          </p>

          <div className="animate-in fade-in slide-in-from-bottom-3 fill-mode-both delay-300 duration-700 mt-8 space-y-4">
            <CopyCommand />
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/docs"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "rounded-full px-5",
                )}
              >
                Read the docs
              </Link>
              <a
                href="https://github.com/SimaAlexandru99/agentscan"
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  buttonVariants({ variant: "ghost", size: "lg" }),
                  "rounded-full px-5",
                )}
              >
                GitHub
              </a>
            </div>
          </div>

          <div className="animate-in fade-in slide-in-from-bottom-4 fill-mode-both delay-500 duration-700 mt-12">
            <TerminalDemo />
          </div>
        </section>
      </div>

      <section className="border-t border-border/60">
        <div className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            How it works
          </h2>
          <p className="mt-4 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
            No AI, no heuristics. Read the config, read the disk, compare. Same
            tree in, same findings out, every time.
          </p>
          <ul className="mt-8 space-y-4 text-base leading-relaxed text-foreground/90">
            <li className="border-l-2 border-primary/70 pl-4">
              No AI — structural checks only, against published specs.
            </li>
            <li className="border-l-2 border-primary/70 pl-4">
              No network — the scan never opens a socket.
            </li>
            <li className="border-l-2 border-primary/70 pl-4">
              Writes nothing — the scanned tree is left untouched.
            </li>
            <li className="border-l-2 border-primary/70 pl-4">
              Every check sourced to a published spec line in{" "}
              <a
                href="https://github.com/SimaAlexandru99/agentscan/tree/master/docs/spec"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline-offset-4 hover:underline"
              >
                docs/spec/
              </a>
              .
            </li>
          </ul>
        </div>
      </section>

      <section className="border-t border-border/60">
        <div className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            Why the tool looks like this
          </h2>
          <p className="mt-4 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
            Alpha. An earlier build reported 37 findings across 17 real projects
            of which <span className="text-foreground">25 were false</span> —
            two checks had been written from what real projects looked like
            instead of from the spec. Both were deleted, and every check that
            survived is recorded in docs/spec/ with the URL it came from and the
            date it was read. That story is the reason this tool exists in its
            current shape.
          </p>
        </div>
      </section>

      <section className="border-t border-border/60">
        <div className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            Run it in 30 seconds
          </h2>
          <p className="mt-4 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
            Point it at a project with agent config. On Node 20.11+ or Bun — the
            published bin is a single bundled file.
          </p>
          <div className="mt-8">
            <CopyCommand />
          </div>
        </div>
      </section>

      <section className="border-t border-border/60">
        <div className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            For agents
          </h2>
          <p className="mt-4 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
            Agents forget the audit. The skill tells them to run it before they
            edit a hook or claim a guard is on.
          </p>
          <div
            className="mt-8 overflow-hidden rounded-xl border border-border bg-black/40 shadow-[inset_0_1px_0_oklch(1_0_0_/6%)]"
            aria-label="agentscan skill — when to run the audit"
          >
            <div className="flex items-center gap-2 border-b border-border/70 px-4 py-2.5">
              <span className="size-2.5 rounded-full bg-foreground/15" />
              <span className="size-2.5 rounded-full bg-foreground/15" />
              <span className="size-2.5 rounded-full bg-foreground/15" />
              <span className="ml-2 font-mono text-xs text-muted-foreground">
                skills/agentscan/SKILL.md
              </span>
            </div>
            <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed sm:text-sm">
              {[
                ["muted", "When   hooks · skills · MCP · AGENTS.md · skills-lock.json"],
                ["default", "Do     npx @chimix/agentscan@latest --output prompt"],
                ["muted", "Don't  write the tree · guess if a hook is valid"],
              ].map(([tone, line]) => (
                <div
                  key={line}
                  className={
                    tone === "muted" ? "text-muted-foreground" : "text-foreground"
                  }
                >
                  {line}
                </div>
              ))}
            </pre>
          </div>
        </div>
      </section>

      <SiteFooter />
    </>
  );
}
