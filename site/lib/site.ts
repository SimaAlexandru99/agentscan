export const SITE_ORIGIN = "https://agentscan.space";
export const SITE_LASTMOD = "2026-09-02";
export const PRODUCT_NAME = "agentscan";
export const PRODUCT_VERSION = "1.4.0";
// The published release, not the repo. `Unreleased` checks are not in the
// package a visitor can install, and the site advertises that package.
export const PRODUCT_CHECKS = 103;
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
