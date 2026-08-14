"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

const COMMAND = "npx @chimix/agentscan check";

export function CopyCommand() {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(COMMAND);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-full border border-border bg-muted/40 px-4 py-2 font-mono text-sm">
        <code className="truncate text-foreground">{COMMAND}</code>
        <Button
          type="button"
          variant="default"
          size="sm"
          className="shrink-0 rounded-full px-4"
          onClick={handleCopy}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
