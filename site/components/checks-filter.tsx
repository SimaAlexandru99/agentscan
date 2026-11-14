"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

const SEVERITIES = ["all", "error", "warning", "info"] as const;
type SeverityFilter = (typeof SEVERITIES)[number];

/**
 * Filters the server-rendered rows in `children` by toggling `hidden`.
 * Without JS the controls do nothing and every row stays visible.
 */
export function ChecksFilter({
  families,
  total,
  children,
}: {
  families: readonly string[];
  total: number;
  children: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState("all");
  const [severity, setSeverity] = useState<SeverityFilter>("all");
  const [shown, setShown] = useState(total);
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const rows = tableRef.current?.querySelectorAll<HTMLTableRowElement>("tr[data-family]");
    if (!rows) return;
    const q = query.trim().toLowerCase();
    let count = 0;
    for (const row of rows) {
      const visible =
        (family === "all" || row.dataset.family === family) &&
        (severity === "all" || (row.dataset.severity ?? "").split("/").includes(severity)) &&
        (q === "" || (row.dataset.search ?? "").includes(q));
      row.hidden = !visible;
      if (visible) count++;
    }
    setShown(count);
  }, [query, family, severity]);

  return (
    <>
      <section aria-label="Filters" className="mt-12 flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="check-search" className="sr-only">
            Search checks
          </label>
          <input
            id="check-search"
            type="search"
            placeholder="Search by id or description"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-h-11 flex-[1_1_320px] rounded-xl border border-input bg-background px-4 text-[15px] text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          />
          <label htmlFor="check-family" className="text-sm text-muted-foreground">
            Agent
          </label>
          <select
            id="check-family"
            value={family}
            onChange={(event) => setFamily(event.target.value)}
            className="min-h-11 rounded-xl border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <option value="all">All agents</option>
            {families.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div role="group" aria-label="Severity" className="flex flex-wrap gap-2">
          {SEVERITIES.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={severity === value}
              onClick={() => setSeverity(value)}
              className={cn(
                "chip min-h-10 cursor-pointer rounded-full border px-3.5 text-[13px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                severity === value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-transparent text-foreground/85",
              )}
            >
              {value === "all" ? "All severities" : value}
            </button>
          ))}
        </div>
        <p aria-live="polite" className="font-mono text-[13px] text-muted-foreground">
          Showing {shown} of {total} checks
        </p>
      </section>
      <div ref={tableRef}>{children}</div>
    </>
  );
}
