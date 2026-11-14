"use client";

import Link from "next/link";
import { useState } from "react";

const SETTINGS = `"PreToolUse": [{ "hooks": [{
  "type": "command",
`;

/**
 * Config says the hook exists, the disk says it does not. CSS plays the
 * sequence once on mount; "Run again" re-mounts it through `key`. The base
 * styles are the end state, so no-JS and reduced-motion readers see it whole.
 */
export function ConfigDiskExplainer() {
  const [run, setRun] = useState(0);

  return (
    <section
      aria-label="How a silent failure happens"
      className="mt-14 rounded-2xl border border-border bg-black/30 p-5 sm:p-7"
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <p className="text-[15px] text-muted-foreground">
          The config says one thing. The disk says another. agentscan reads both.
        </p>
        <button
          type="button"
          onClick={() => setRun((n) => n + 1)}
          className="chip min-h-10 rounded-full border border-border px-4 text-[13px] text-foreground/85"
        >
          Run again
        </button>
      </div>

      <div key={run}>
        <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-[minmax(0,1fr)_160px_minmax(0,1fr)] md:gap-0">
          <div className="rounded-xl border border-border bg-card px-5 py-4">
            <p className="mb-3 font-mono text-xs text-muted-foreground">.claude/settings.json</p>
            <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-foreground/85">
              {SETTINGS}
              <span className="text-primary">
                {`  "command": ".claude/hooks/guard-destructive-bash.js"`}
              </span>
              {`\n}] }]`}
            </pre>
          </div>

          <div aria-hidden className="relative hidden h-[120px] md:block">
            <svg viewBox="0 0 160 120" width="160" height="120" className="block">
              <path
                className="explainer-wire stroke-primary"
                d="M0 60 C 50 60, 110 60, 160 60"
                fill="none"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <div className="explainer-break absolute left-[62px] top-[42px] flex size-9 items-center justify-center rounded-full border-2 border-primary bg-background">
              <svg viewBox="0 0 24 24" width="16" height="16">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  className="stroke-primary"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card px-5 py-4">
            <p className="mb-3 font-mono text-xs text-muted-foreground">.claude/hooks/</p>
            <ul className="font-mono text-sm leading-loose text-foreground/85">
              <li>format-on-write.js</li>
              <li className="explainer-gone text-primary line-through">
                <span className="sr-only">missing: </span>guard-destructive-bash.js
              </li>
              <li>notify.sh</li>
            </ul>
          </div>
        </div>

        <p className="explainer-finding mt-5 border-t border-border/60 pt-4 font-mono text-sm leading-relaxed text-foreground/85">
          <span className="rounded bg-primary px-2 py-px font-medium text-background">ERROR</span>{" "}
          <Link href="/checks#claude.hook.missing-script" className="underline-offset-4 hover:underline">
            claude.hook.missing-script
          </Link>{" "}
          · PreToolUse hook points at a script that does not exist · score 90/100
        </p>
      </div>
    </section>
  );
}
