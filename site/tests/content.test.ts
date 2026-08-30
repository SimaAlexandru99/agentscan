import { describe, expect, test } from "bun:test";

import { softwareApplicationJsonLd } from "../lib/json-ld";
import {
  ABOUT_MARKDOWN,
  CONTACT_MARKDOWN,
  DOCS_MARKDOWN,
  HOME_MARKDOWN,
  LLMS_TXT,
  NOT_FOUND_MARKDOWN,
  PRIVACY_MARKDOWN,
  markdownForPath,
} from "../lib/markdown";
import { AGENTSCAN_SKILL_DIGEST, AGENTSCAN_SKILL_MD } from "../lib/skill";
import { INDEXABLE_PATHS, RUN_COMMAND, SITE_LASTMOD } from "../lib/site";

describe("1.0 public copy", () => {
  test("homepage and docs markdown keep 1.0 facts", () => {
    for (const body of [HOME_MARKDOWN, DOCS_MARKDOWN]) {
      expect(body).toContain("1.0.0");
      expect(body).toContain("59 checks");
      expect(body).toContain("claude.hook.missing-script");
      expect(body.toLowerCase()).toContain("error");
      expect(body.toLowerCase()).toContain("heuristic");
      expect(body).not.toContain("Alpha");
    }
  });

  test("React pages were not reverted to Alpha copy", async () => {
    const home = await Bun.file(new URL("../app/page.tsx", import.meta.url)).text();
    const docs = await Bun.file(
      new URL("../app/docs/page.tsx", import.meta.url),
    ).text();
    for (const source of [home, docs]) {
      expect(source).toContain("1.0.0");
      expect(source).toContain("59 checks");
      expect(source).toContain("claude.hook.missing-script");
      expect(source).not.toContain("Alpha");
    }
    expect(home).toContain("Heuristics stay at info and are labeled");
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
