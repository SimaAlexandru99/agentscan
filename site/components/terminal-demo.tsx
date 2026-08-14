const LINES = [
  { tone: "muted", text: "$ agentscan check" },
  { tone: "blank", text: "" },
  {
    tone: "warn",
    text: "WARN    hook:PreToolUse:.claude/hooks/guard-destructive-bash.js",
  },
  { tone: "muted", text: "        rule:hook.missing-script" },
  {
    tone: "default",
    text: "        PreToolUse hook points at a script that does not exist",
  },
  {
    tone: "muted",
    text: "        evidence: hook PreToolUse @ …/.claude/settings.json",
  },
  { tone: "blank", text: "" },
  {
    tone: "default",
    text: "Summary: 6 warn · 4 info hidden (--verbose) · score 40/100",
  },
] as const;

export function TerminalDemo() {
  return (
    <div
      className="overflow-hidden rounded-xl border border-border bg-black/40 shadow-[inset_0_1px_0_oklch(1_0_0_/6%)]"
      aria-label="Sample agentscan output showing hook.missing-script"
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
            className={
              line.tone === "warn"
                ? "text-primary"
                : line.tone === "muted"
                  ? "text-muted-foreground"
                  : "text-foreground"
            }
          >
            {line.text || "\u00a0"}
          </div>
        ))}
      </pre>
    </div>
  );
}
