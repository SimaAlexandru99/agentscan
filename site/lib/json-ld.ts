import {
  GITHUB_REPO,
  NPM_PACKAGE,
  NPM_URL,
  PRODUCT_NAME,
  PRODUCT_VERSION,
  SITE_ORIGIN,
} from "@/lib/site";

export const softwareApplicationJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: PRODUCT_NAME,
  description:
    "Offline linter for agent configuration — hooks, skills, MCP configs, AGENTS.md, and skills-lock.json. 1.0.0, 59 checks. No AI, no network on check, writes nothing.",
  url: SITE_ORIGIN,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Linux, macOS, Windows",
  softwareVersion: PRODUCT_VERSION,
  license: "https://opensource.org/licenses/MIT",
  downloadUrl: NPM_URL,
  installUrl: NPM_URL,
  softwareRequirements: `Node.js 20.11+ or Bun; npm package ${NPM_PACKAGE}`,
  codeRepository: GITHUB_REPO,
  sameAs: [GITHUB_REPO, NPM_URL],
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
} as const;

export function softwareApplicationJsonLdScript(): string {
  return JSON.stringify(softwareApplicationJsonLd);
}
