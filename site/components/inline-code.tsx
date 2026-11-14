/** Release text keeps markdown inline code; render it as `<code>`. */
export function InlineCode({ text }: { text: string }) {
  return text.split(/(`[^`]+`)/).map((part, index) =>
    part.startsWith("`") && part.endsWith("`") && part.length > 1 ? (
      <code key={index} className="font-mono text-[0.9em] text-foreground">
        {part.slice(1, -1)}
      </code>
    ) : (
      part
    ),
  );
}
