"use client";

import Link from "next/link";
import { useState } from "react";

import { AGENT_EXAMPLES } from "@/lib/home";
import { cn } from "@/lib/utils";

/** Pick an agent: the files agentscan reads for it and one finding it raises. */
export function AgentSelector() {
  const [pick, setPick] = useState(0);
  const current = AGENT_EXAMPLES[pick] ?? AGENT_EXAMPLES[0]!;

  return (
    <>
      <div role="group" aria-label="Choose an agent" className="flex flex-wrap gap-2">
        {AGENT_EXAMPLES.map((agent, index) => (
          <button
            key={agent.name}
            type="button"
            aria-pressed={index === pick}
            onClick={() => setPick(index)}
            className={cn(
              "chip min-h-11 rounded-full border px-4 text-sm font-medium",
              index === pick
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-foreground/85",
            )}
          >
            {agent.name}
          </button>
        ))}
      </div>

      <div
        key={current.name}
        className="swap mt-6 grid grid-cols-1 overflow-hidden rounded-2xl border border-border md:grid-cols-2"
      >
        <ul className="flex flex-col gap-2.5 bg-black/30 p-6">
          {current.files.map(([kind, path]) => (
            <li key={`${kind}${path}`} className="grid grid-cols-[64px_minmax(0,1fr)] items-baseline gap-3">
              <span className="font-mono text-xs text-primary">{kind}</span>
              <code className="font-mono text-sm break-words text-foreground/85">{path}</code>
            </li>
          ))}
        </ul>
        <div className="border-t border-border/60 bg-card p-6 md:border-t-0 md:border-l">
          <p className="mb-2.5 font-mono text-xs text-muted-foreground">A finding it can raise</p>
          <p className="font-mono text-sm leading-relaxed text-foreground/85">
            <span className="rounded bg-primary px-2 py-px text-background">{current.sev}</span>{" "}
            <Link href={`/checks#${current.rule}`} className="underline-offset-4 hover:underline">
              {current.rule}
            </Link>
          </p>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{current.msg}</p>
        </div>
      </div>
    </>
  );
}
