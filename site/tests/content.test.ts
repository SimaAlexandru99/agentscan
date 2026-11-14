import { describe, expect, test } from "bun:test";

import { metadata as changelogMetadata } from "../app/changelog/page";
import { metadata as checksMetadata } from "../app/checks/page";
import { metadata as homeMetadata } from "../app/page";
import { metadata as resultsMetadata } from "../app/results/page";
import checksData from "../data/checks.json";
import releasesData from "../data/releases.json";
import { AGENT_EXAMPLES, HOME_METRICS } from "../lib/home";
import { jsonLdScript, softwareApplicationJsonLd } from "../lib/json-ld";
import { RESULT_CASES } from "../lib/results";
import {
  ABOUT_MARKDOWN,
  CHANGELOG_MARKDOWN,
  CHECKS_MARKDOWN,
  CONTACT_MARKDOWN,
  RESULTS_MARKDOWN,
  DOCS_MARKDOWN,
  HOME_MARKDOWN,
  LLMS_TXT,
  NOT_FOUND_MARKDOWN,
  PRIVACY_MARKDOWN,
  markdownForPath,
} from "../lib/markdown";
import { AGENTSCAN_SKILL_DIGEST, AGENTSCAN_SKILL_MD } from "../lib/skill";
import {
  COVERAGE_LINES,
  INDEXABLE_PATHS,
  PRODUCT_CHECKS,
  PRODUCT_VERSION,
  RUN_COMMAND,
  SITE_LASTMOD,
} from "../lib/site";

describe("1.0 public copy", () => {
  test("homepage and docs markdown keep current version facts", () => {
    for (const body of [HOME_MARKDOWN, DOCS_MARKDOWN]) {
      expect(body).toContain(PRODUCT_VERSION);
      expect(body).toContain(`${PRODUCT_CHECKS} checks`);
      expect(body).toContain("claude.hook.missing-script");
      expect(body.toLowerCase()).toContain("error");
      expect(body.toLowerCase()).toContain("heuristic");
      expect(body).not.toContain("Alpha");
    }
  });

  test("React pages were not reverted to Alpha copy", async () => {
    const home =
      (await Bun.file(new URL("../app/page.tsx", import.meta.url)).text()) +
      (await Bun.file(new URL("../components/config-disk-explainer.tsx", import.meta.url)).text());
    const docs = await Bun.file(
      new URL("../app/docs/page.tsx", import.meta.url),
    ).text();
    for (const source of [home, docs]) {
      expect(source).toContain("PRODUCT_VERSION");
      expect(source).toContain("PRODUCT_CHECKS");
      expect(source).toContain("claude.hook.missing-script");
      expect(source).not.toContain("Alpha");
    }
    expect(home).toContain("Heuristics stay at info and are labeled");
    expect(home).toContain("BREAKING_NOTE");
    expect(docs).toContain("BREAKING_NOTE");
    expect(docs).toContain("GLOBAL_FLAG_MEANING");
  });

  test("markdown names the current surfaces and the breaking ids", () => {
    for (const body of [ABOUT_MARKDOWN, LLMS_TXT]) {
      expect(body).toContain(`What ${PRODUCT_VERSION} reads`);
    }
    // The home markdown mirrors the new home: one "Agents it reads" section names every agent.
    expect(HOME_MARKDOWN).toContain("## Agents it reads");
    for (const body of [HOME_MARKDOWN, ABOUT_MARKDOWN, LLMS_TXT]) {
      for (const line of COVERAGE_LINES) {
        expect(body).toContain(line);
      }
    }
    expect(HOME_MARKDOWN).toContain("skillListingChars");
    expect(DOCS_MARKDOWN).toContain("skillListingChars");
    expect(DOCS_MARKDOWN).not.toContain("~/.claude/skills, ~/.codex/skills");
  });
});

describe("agent-friendly 404 body", () => {
  test("points at sitemap, llms.txt, and docs", () => {
    expect(NOT_FOUND_MARKDOWN).toContain("/sitemap.xml");
    expect(NOT_FOUND_MARKDOWN).toContain("/llms.txt");
    expect(NOT_FOUND_MARKDOWN).toContain("/docs");
    expect(markdownForPath("/some-path-that-does-not-exist").status).toBe(404);
    expect(markdownForPath("/some-path-that-does-not-exist").body).toBe(
      NOT_FOUND_MARKDOWN,
    );
  });
});

describe("llms.txt", () => {
  test("names the product, when-to-use jobs, and how to call", () => {
    expect(LLMS_TXT.startsWith("# agentscan")).toBe(true);
    expect(LLMS_TXT).toContain("## When to use");
    expect(LLMS_TXT.toLowerCase()).toContain("hooks");
    expect(LLMS_TXT).toContain("MCP");
    expect(LLMS_TXT).toContain("skills-lock");
    expect(LLMS_TXT).toContain("AGENTS.md");
    expect(LLMS_TXT).toContain(RUN_COMMAND);
    expect(LLMS_TXT).toContain("/docs.md");
    expect(LLMS_TXT).toContain("github.com/SimaAlexandru99/agentscan");
    expect(LLMS_TXT).toContain("npmjs.com/package/@chimix/agentscan");
  });

  test("does not invent an OpenAPI or hosted MCP URL", () => {
    expect(LLMS_TXT).not.toMatch(/agentscan\.space\/openapi/);
    expect(LLMS_TXT).not.toMatch(/\/api\/openapi/);
    expect(LLMS_TXT).not.toMatch(/agentscan\.space\/mcp(?![\w-])/);
    expect(LLMS_TXT).toContain("no Streamable HTTP MCP server");
    expect(LLMS_TXT).toContain("no OpenAPI document");
  });
});

describe("trust pages", () => {
  test("about, contact, and privacy are at least 500 characters", () => {
    expect(ABOUT_MARKDOWN.length).toBeGreaterThanOrEqual(500);
    expect(CONTACT_MARKDOWN.length).toBeGreaterThanOrEqual(500);
    expect(PRIVACY_MARKDOWN.length).toBeGreaterThanOrEqual(500);
  });

  test("contact only uses public GitHub and npm", () => {
    expect(CONTACT_MARKDOWN).toContain("github.com/SimaAlexandru99/agentscan");
    expect(CONTACT_MARKDOWN).toContain("npmjs.com/package/@chimix/agentscan");
    expect(CONTACT_MARKDOWN.toLowerCase()).not.toContain("brasov");
    expect(CONTACT_MARKDOWN.toLowerCase()).not.toContain("nextjourney");
    expect(CONTACT_MARKDOWN).not.toMatch(/\+40/);
    expect(CONTACT_MARKDOWN).not.toMatch(/@nextjourney/);
  });
});

describe("JSON-LD", () => {
  test("homepage identity is SoftwareApplication", () => {
    expect(softwareApplicationJsonLd["@type"]).toBe("SoftwareApplication");
    expect(softwareApplicationJsonLd.name).toBe("agentscan");
    expect(softwareApplicationJsonLd.url).toBe("https://agentscan.space");
    expect(softwareApplicationJsonLd.description.length).toBeGreaterThan(20);
    expect(softwareApplicationJsonLd.offers.price).toBe("0");
    expect(softwareApplicationJsonLd).not.toHaveProperty("address");
    expect(softwareApplicationJsonLd).not.toHaveProperty("telephone");
  });
});

describe("sitemap inputs", () => {
  test("lists indexable pages with lastmod", () => {
    expect(INDEXABLE_PATHS).toContain("/");
    expect(INDEXABLE_PATHS).toContain("/docs");
    expect(INDEXABLE_PATHS).toContain("/about");
    expect(INDEXABLE_PATHS).toContain("/contact");
    expect(INDEXABLE_PATHS).toContain("/privacy");
    expect(SITE_LASTMOD).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("skill discovery", () => {
  test("digest matches the served skill bytes", () => {
    expect(AGENTSCAN_SKILL_DIGEST.startsWith("sha256:")).toBe(true);
    expect(AGENTSCAN_SKILL_MD).toContain("npx @chimix/agentscan@latest");
    expect(AGENTSCAN_SKILL_MD).toContain("claude.hook.missing-script");
  });
});

describe("checks and changelog pages", () => {
  test("are indexable with the current lastmod", () => {
    expect(INDEXABLE_PATHS).toContain("/checks");
    expect(INDEXABLE_PATHS).toContain("/changelog");
    expect(SITE_LASTMOD).toBe("2026-11-14");
  });

  test("titles fit 60 chars with the template, descriptions are 120-160", () => {
    for (const meta of [checksMetadata, changelogMetadata]) {
      expect(`${String(meta.title)} · agentscan`.length).toBeLessThanOrEqual(60);
      const description = meta.description ?? "";
      expect(description.length).toBeGreaterThanOrEqual(120);
      expect(description.length).toBeLessThanOrEqual(160);
    }
    expect(String(checksMetadata.title)).toBe(`All ${checksData.length} agentscan checks`);
  });

  test("markdown variants come from the generated data", () => {
    expect(markdownForPath("/checks.md").body).toBe(CHECKS_MARKDOWN);
    expect(markdownForPath("/changelog").body).toBe(CHANGELOG_MARKDOWN);
    for (const check of checksData) {
      expect(CHECKS_MARKDOWN).toContain(`\`${check.id}\``);
    }
    for (const release of releasesData) {
      expect(CHANGELOG_MARKDOWN).toContain(`## ${release.version} — ${release.date}`);
    }
    expect(CHANGELOG_MARKDOWN).toContain("Only 2.0.0 and 2.3.1 were published to npm");
    expect(LLMS_TXT).toContain("https://agentscan.space/checks.md");
    expect(LLMS_TXT).toContain("https://agentscan.space/changelog.md");
  });

  test("JSON-LD script text cannot close its tag", () => {
    expect(jsonLdScript({ text: "</script><x>" })).not.toContain("<");
  });
});

describe("home and results pages", () => {
  test("home title and description fit, JSON-LD offers price 0 and the current version", () => {
    const title = (homeMetadata.title as { absolute: string }).absolute;
    expect(title.length).toBeLessThanOrEqual(60);
    const description = homeMetadata.description ?? "";
    expect(description.length).toBeGreaterThanOrEqual(120);
    expect(description.length).toBeLessThanOrEqual(160);
    for (const phrase of ["hooks that no longer run", "MCP servers that cannot start", "Offline"]) {
      expect(description).toContain(phrase);
    }
    expect(softwareApplicationJsonLd.softwareVersion).toBe(PRODUCT_VERSION);
    expect(softwareApplicationJsonLd.offers.price).toBe("0");
    expect(JSON.stringify(softwareApplicationJsonLd)).not.toContain("aggregateRating");
  });

  test("results metadata fits and the page is indexable with a markdown variant", () => {
    expect(`${String(resultsMetadata.title)} · agentscan`.length).toBeLessThanOrEqual(60);
    const description = resultsMetadata.description ?? "";
    expect(description.length).toBeGreaterThanOrEqual(120);
    expect(description.length).toBeLessThanOrEqual(160);
    expect(INDEXABLE_PATHS).toContain("/results");
    expect(markdownForPath("/results.md").body).toBe(RESULTS_MARKDOWN);
    expect(RESULTS_MARKDOWN).toContain("692 → 251");
    expect(LLMS_TXT).toContain("https://agentscan.space/results.md");
  });

  test("every rule id the home and results pages name exists with a matching severity", () => {
    const severity = new Map(checksData.map((check) => [check.id, check.severity]));
    for (const agent of AGENT_EXAMPLES) {
      const actual = severity.get(agent.rule);
      expect(actual).toBeDefined();
      expect(actual).toContain(agent.sev === "WARN" ? "warning" : "error");
    }
    for (const item of RESULT_CASES) {
      expect(severity.has(item.rule)).toBe(true);
    }
    expect(HOME_METRICS[2].value).toBe(
      `${checksData.filter((check) => check.sourceUrl !== null).length} / ${checksData.length}`,
    );
  });
});

describe("version and count come from the generated data", () => {
  test("PRODUCT_CHECKS is checks.json length; the newest release is PRODUCT_VERSION", () => {
    expect(PRODUCT_CHECKS).toBe(checksData.length);
    expect(releasesData[0]?.version).toBe(PRODUCT_VERSION);
  });
});
