"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Shows one of the server-rendered panels in `children` by toggling `hidden`.
 * Without JS the buttons do nothing and every panel stays visible.
 */
export function AgentPicker({
  names,
  children,
}: {
  names: readonly string[];
  children: React.ReactNode;
}) {
  const [pick, setPick] = useState(0);
  const panelsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const panels = panelsRef.current?.querySelectorAll<HTMLElement>("[data-agent-panel]");
    // Un-hiding a panel restarts its CSS `swap` animation.
    panels?.forEach((panel, index) => {
      panel.hidden = index !== pick;
    });
  }, [pick]);

  return (
    <>
      <div role="group" aria-label="Choose an agent" className="flex flex-wrap gap-2">
        {names.map((name, index) => (
          <button
            key={name}
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
            {name}
          </button>
        ))}
      </div>
      <div ref={panelsRef}>{children}</div>
    </>
  );
}
