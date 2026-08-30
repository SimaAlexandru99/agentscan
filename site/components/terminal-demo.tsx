const LINES = [
  { tone: "muted", text: "$ agentscan check" },
  { tone: "blank", text: "" },
  {
    tone: "error",
    text: "ERROR   rule:claude.hook.missing-script",
  },
  {
    tone: "default",
    text: "        PreToolUse hook points at a script that does not exist: .claude/hooks/guard-destructive-bash.js",
  },
  {
    tone: "muted",
    text: "          PreToolUse @ .claude/settings.json · .claude/hooks/guard-destructive-bash.js",
  },
  { tone: "blank", text: "" },
  {
    tone: "default",
    text: "Summary: 1 error · score 90/100",
  },
] as const;

function lineClass(tone: (typeof LINES)[number]["tone"]): string {
  switch (tone) {
    case "error":
      return "text-destructive";
    case "muted":
      return "text-muted-foreground";
    case "default":
    case "blank":
      return "text-foreground";
    default: {
      const _exhaustive: never = tone;
      return _exhaustive;
    }
  }
}

export function TerminalDemo() {
  return (
    <div
      className="overflow-hidden rounded-xl border border-border bg-black/40 shadow-[inset_0_1px_0_oklch(1_0_0_/6%)]"
      aria-label="Sample agentscan output showing claude.hook.missing-script at error"
    >
      <div className="flex items-center gap-2 border-b border-border/70 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-foreground/15" />
        <span className="size-2.5 rounded-full bg-foreground/15" />
        <span className="size-2.5 rounded-full bg-foreground/15" />
        <span className="ml-2 font-mono text-xs text-muted-foreground">
          agentscan check
        </span>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed sm:text-sm">
        {LINES.map((line, index) => (
          <div
            key={`${index}-${line.text || "blank"}`}
            className={lineClass(line.tone)}
          >
            {line.text || "\u00a0"}
          </div>
        ))}
      </pre>
    </div>
  );
}
