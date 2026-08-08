/** Strip range prefixes and take the first major.minor.patch token. */
export function coerceVersion(range: string): string | null {
  const cleaned = range.trim().replace(/^(?:>=|<=|>|<|=|\^|~)/, "");
  const match = cleaned.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }
  return `${match[1]}.${match[2]}.${match[3]}`;
}

function parseParts(version: string): number[] {
  return version.split(".").map((part) => {
    const n = Number.parseInt(part, 10);
    return Number.isFinite(n) ? n : 0;
  });
}

function compare(a: string, b: string): number {
  const left = parseParts(a);
  const right = parseParts(b);
  const len = Math.max(left.length, right.length);
  for (let i = 0; i < len; i++) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (l > r) {
      return 1;
    }
    if (l < r) {
      return -1;
    }
  }
  return 0;
}

export function gte(version: string, min: string): boolean {
  return compare(version, min) >= 0;
}

export function lt(version: string, max: string): boolean {
  return compare(version, max) < 0;
}
