import { isAbsolute, relative, resolve, sep } from "node:path";

/** Backslashes to `/`, so path patterns match the same on every host. */
export function toPosix(path: string): string {
  return path.replaceAll("\\", "/");
}

/** `child` is `parent` or below it, after resolving both. */
export function isInside(child: string, parent: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}
