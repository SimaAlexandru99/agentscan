import {
  GITHUB_REPO,
  NPM_PACKAGE,
  NPM_URL,
  PRODUCT_CHECKS,
  PRODUCT_NAME,
  PRODUCT_VERSION,
  SITE_ORIGIN,
} from "@/lib/site";

export const softwareApplicationJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: PRODUCT_NAME,
  description:
    `Offline linter for agent configuration — hooks, skills, MCP configs, AGENTS.md, and skills-lock.json. ${PRODUCT_VERSION}, ${PRODUCT_CHECKS} checks. No AI, no network on check, writes nothing.`,
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

export function breadcrumbJsonLd(name: string, path: string) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: PRODUCT_NAME, item: `${SITE_ORIGIN}/` },
      { "@type": "ListItem", position: 2, name, item: `${SITE_ORIGIN}${path}` },
    ],
  };
}

export function itemListJsonLd(
  name: string,
  items: ReadonlyArray<{ name: string; url: string }>,
) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      url: item.url,
    })),
  };
}

/** `<` is escaped so rule text such as `<id>` cannot close the script tag. */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
