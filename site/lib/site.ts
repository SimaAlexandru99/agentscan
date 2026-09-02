export const SITE_ORIGIN = "https://agentscan.space";
export const SITE_LASTMOD = "2026-08-31";
export const PRODUCT_NAME = "agentscan";
export const PRODUCT_VERSION = "1.3.0";
export const PRODUCT_CHECKS = 102;
export const NPM_PACKAGE = "@chimix/agentscan";
export const GITHUB_REPO = "https://github.com/SimaAlexandru99/agentscan";
export const GITHUB_ISSUES = `${GITHUB_REPO}/issues`;
export const NPM_URL = "https://www.npmjs.com/package/@chimix/agentscan";
export const RUN_COMMAND = "npx @chimix/agentscan@latest";
export const CHECK_COMMAND = "npx @chimix/agentscan check";

export const INDEXABLE_PATHS = [
  "/",
  "/docs",
  "/about",
  "/contact",
  "/privacy",
] as const;

export type IndexablePath = (typeof INDEXABLE_PATHS)[number];

export function absoluteUrl(path: string): string {
  if (path === "/") {
    return `${SITE_ORIGIN}/`;
  }
  return `${SITE_ORIGIN}${path}`;
}
