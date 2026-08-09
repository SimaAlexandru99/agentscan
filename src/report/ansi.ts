/**
 * The only file in the tool that knows what an escape sequence looks like.
 *
 * Colour is a deliberate exception to the rule that no escape byte reaches the
 * terminal. `safe()` exists because a scanned project can name a skill
 * `\u001b[2J` and forge report lines; that still holds. The invariant is now
 * "the only escapes in the output are ones this file wrote" — every value from
 * the scan goes through `safe()` first, and colour only ever wraps the result.
 * Never build a colour code out of scanned text.
 */

export type Tone = "green" | "yellow" | "red";

const CODES = {
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  red: "\u001b[31m",
  dim: "\u001b[2m",
  bold: "\u001b[1m",
  reset: "\u001b[0m",
} as const;

export type Paint = {
  tone: (tone: Tone, text: string) => string;
  /**
   * Bold and coloured in one wrapper.
   *
   * Nesting `tone(bold(x))` emits two resets, and the inner one closes the
   * colour early — harmless at the end of a run, wrong the moment anything
   * follows inside the same wrapper. One code pair, no nesting.
   */
  strong: (tone: Tone, text: string) => string;
  dim: (text: string) => string;
  bold: (text: string) => string;
  /** True when this painter actually emits escapes. */
  enabled: boolean;
};

const PLAIN: Paint = {
  tone: (_tone, text) => text,
  strong: (_tone, text) => text,
  dim: (text) => text,
  bold: (text) => text,
  enabled: false,
};

/**
 * A painter, on or off.
 *
 * Returning identity functions rather than letting callers branch means the
 * coloured and uncoloured reports run the same code path, so a layout bug
 * cannot exist in one and not the other.
 */
export function paint(enabled: boolean): Paint {
  if (!enabled) {
    return PLAIN;
  }
  return {
    tone: (tone, text) => `${CODES[tone]}${text}${CODES.reset}`,
    strong: (tone, text) => `${CODES.bold}${CODES[tone]}${text}${CODES.reset}`,
    dim: (text) => `${CODES.dim}${text}${CODES.reset}`,
    bold: (text) => `${CODES.bold}${text}${CODES.reset}`,
    enabled: true,
  };
}

/**
 * Whether to colour, given a stream and an environment.
 *
 * Pure in its arguments so the decision is testable without a terminal.
 * Precedence, strongest first:
 *
 * 1. `noColorFlag` — the user said `--no-color` on this run.
 * 2. `NO_COLOR` — the cross-tool convention (no-color.org). Any non-empty
 *    value counts; CI systems and pagers set it.
 * 3. `FORCE_COLOR` — asks for colour through a pipe, which is how you capture
 *    a coloured report for a screenshot or a CI renderer that understands
 *    escapes.
 * 4. Otherwise: only when the destination is a terminal.
 */
export function shouldColour(args: {
  isTTY: boolean;
  env: Record<string, string | undefined>;
  noColorFlag?: boolean;
}): boolean {
  if (args.noColorFlag === true) {
    return false;
  }
  const { NO_COLOR, FORCE_COLOR } = args.env;
  if (NO_COLOR !== undefined && NO_COLOR !== "") {
    return false;
  }
  if (FORCE_COLOR !== undefined && FORCE_COLOR !== "" && FORCE_COLOR !== "0") {
    return true;
  }
  return args.isTTY;
}
