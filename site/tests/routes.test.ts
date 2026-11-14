import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { varyIncludesAccept } from "../lib/accept";
import { PRODUCT_CHECKS, PRODUCT_VERSION } from "../lib/site";
import { AGENTSCAN_SKILL_DIGEST } from "../lib/skill";

const siteRoot = join(import.meta.dir, "..");

let child: ReturnType<typeof Bun.spawn> | undefined;
let base = "";

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (child && child.exitCode !== null) {
      throw new Error(`next start exited ${child.exitCode} before ready`);
    }
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status > 0) {
        return;
      }
    } catch {
      await Bun.sleep(200);
    }
  }
  throw new Error(`server did not start: ${url}`);
}

beforeAll(async () => {
  if (!existsSync(join(siteRoot, ".next"))) {
    const build = Bun.spawn(["bun", "run", "build"], {
      cwd: siteRoot,
      stdout: "inherit",
      stderr: "inherit",
    });
    const buildCode = await build.exited;
    if (buildCode !== 0) {
      throw new Error(`site build failed (${buildCode})`);
    }
  }

  const port = 4173;
  base = `http://127.0.0.1:${port}`;
  child = Bun.spawn(
    ["bun", "run", "start", "--", "-H", "127.0.0.1", "-p", String(port)],
    {
      cwd: siteRoot,
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  await waitForServer(base, 25_000);
});

afterAll(() => {
  if (child) {
    child.kill();
  }
});

async function probe(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; contentType: string; vary: string; body: string }> {
  const res = await fetch(`${base}${path}`, init);
  return {
    status: res.status,
    contentType: res.headers.get("content-type") ?? "",
    vary: res.headers.get("vary") ?? "",
    body: await res.text(),
  };
}

describe("public routes", () => {
  test("unknown paths are HTTP 404, not a 200 app shell", async () => {
    const html = await probe("/some-path-that-does-not-exist");
    expect(html.status).toBe(404);
    expect(html.body.toLowerCase()).toContain("not found");
    expect(html.body).toContain("/sitemap.xml");
    expect(html.body).toContain("/llms.txt");
    expect(html.body).toContain("/docs");

    const md = await probe("/some-path-that-does-not-exist", {
      headers: { Accept: "text/markdown" },
    });
    expect(md.status).toBe(404);
    expect(md.contentType).toMatch(/text\/markdown/);
    expect(varyIncludesAccept(md.vary)).toBe(true);
    expect(md.body).toContain("/sitemap.xml");
    expect(md.body).toContain("/llms.txt");
    expect(md.body).toContain("/docs");
  });

  test("Accept: text/markdown returns markdown with Vary: Accept", async () => {
    for (const path of [
      "/",
      "/docs",
      "/checks",
      "/results",
      "/changelog",
      "/about",
      "/contact",
      "/privacy",
    ]) {
      const res = await probe(path, { headers: { Accept: "text/markdown" } });
      expect(res.status).toBe(200);
      expect(res.contentType).toMatch(/text\/markdown/);
      expect(varyIncludesAccept(res.vary)).toBe(true);
      expect(res.body.startsWith("# ")).toBe(true);
      expect(res.body).toContain("agentscan");
    }
  });

  test(".md sibling URLs are markdown", async () => {
    const res = await probe("/docs.md");
    expect(res.status).toBe(200);
    expect(res.contentType).toMatch(/text\/markdown/);
    expect(res.body).toContain("agentscan docs");
  });

  test("HTML homepage still renders and includes JSON-LD plus metadata", async () => {
    const res = await probe("/", {
      headers: { Accept: "text/html" },
    });
    expect(res.status).toBe(200);
    expect(res.contentType).toMatch(/text\/html/);
    expect(res.body).toContain("application/ld+json");
    expect(res.body).toContain("SoftwareApplication");
    expect(res.body).toContain('rel="canonical"');
    expect(res.body).toContain("og:image");
    expect(res.body).toContain('og:type" content="website"');
    expect(res.body).toContain('lang="en"');
    // From the constants, not literals: the check count is written in five
    // places and the last hand-edit missed two of them.
    expect(res.body).toContain(PRODUCT_VERSION);
    expect(res.body).toContain(`${PRODUCT_CHECKS} checks`);
    expect(res.body).toContain(
      "<title>agentscan: lint Claude Code hooks, MCP configs and skills</title>",
    );
    expect(res.body).toContain('og:title" content="agentscan: lint Claude Code hooks');
    expect(res.body).toContain("claude.hook.missing-script");
    expect(res.body).toContain('href="/results"');
    expect(res.body).toContain('href="/changelog#v2.3.1"');
    expect(res.body).toContain('"price":"0"');
    expect(res.body).toContain("skillListingChars");
    expect(res.body).not.toContain("Alpha");
  });

  test("docs HTML names --global user locations and the breaking ids", async () => {
    const res = await probe("/docs", { headers: { Accept: "text/html" } });
    expect(res.status).toBe(200);
    expect(res.body).toContain("Copilot mcp-config.json");
    expect(res.body).toContain("skillListingChars");
    expect(res.body).toContain("v1 does not write the tree");
    expect(res.body).not.toContain("~/.claude/skills, ~/.codex/skills");
  });

  test("llms.txt is markdown and honest", async () => {
    const res = await probe("/llms.txt");
    expect(res.status).toBe(200);
    expect(res.contentType).toMatch(/text\/markdown/);
    expect(varyIncludesAccept(res.vary)).toBe(true);
    expect(res.body).toContain("## When to use");
    expect(res.body).toContain("npx @chimix/agentscan@latest");
    expect(res.body).not.toMatch(/agentscan\.space\/openapi/);
  });

  test("sitemap.xml includes lastmod and stays small", async () => {
    const res = await probe("/sitemap.xml");
    expect(res.status).toBe(200);
    expect(res.contentType).toMatch(/xml/);
    expect(res.body).toContain("<urlset");
    expect(res.body).toContain("<lastmod>");
    expect(res.body).toContain("https://agentscan.space");
    expect(res.body).toContain("/docs");
    expect(res.body).toContain("/about");
    expect(Buffer.byteLength(res.body, "utf8")).toBeLessThan(50 * 1024 * 1024);
  });

  test("robots.txt allows the site and points at the sitemap", async () => {
    const res = await probe("/robots.txt");
    expect(res.status).toBe(200);
    expect(res.body).toContain("Allow: /");
    expect(res.body).toContain("Sitemap: https://agentscan.space/sitemap.xml");
  });

  test("agent skill manifest exists and is not a hosted MCP", async () => {
    const index = await probe("/.well-known/agent-skills/index.json");
    expect(index.status).toBe(200);
    expect(index.contentType).toMatch(/application\/json/);
    const parsed = JSON.parse(index.body) as {
      skills: Array<{ url: string; digest: string }>;
    };
    expect(parsed.skills[0]?.digest).toBe(AGENTSCAN_SKILL_DIGEST);
    expect(parsed.skills[0]?.url).toContain("/SKILL.md");

    const skill = await probe("/.well-known/agent-skills/agentscan/SKILL.md");
    expect(skill.status).toBe(200);
    expect(skill.contentType).toMatch(/text\/markdown/);
    expect(skill.body).toContain("npx @chimix/agentscan@latest");
  });

  test("does not publish a fake OpenAPI or MCP HTTP API", async () => {
    const openapi = await probe("/openapi.json");
    expect(openapi.status).toBe(404);
    const yaml = await probe("/api/openapi.yaml");
    expect(yaml.status).toBe(404);
    const mcp = await probe("/mcp");
    expect(mcp.status).toBe(404);
    expect(mcp.contentType).not.toMatch(/application\/json/);
  });

  test("unsatisfiable document Accept is 406", async () => {
    const res = await probe("/docs", { headers: { Accept: "application/pdf" } });
    expect(res.status).toBe(406);
    expect(varyIncludesAccept(res.vary)).toBe(true);
  });

  test("trust pages are reachable as HTML", async () => {
    for (const path of ["/about", "/contact", "/privacy"]) {
      const res = await probe(path, { headers: { Accept: "text/html" } });
      expect(res.status).toBe(200);
      expect(res.contentType).toMatch(/text\/html/);
      expect(res.body.length).toBeGreaterThan(500);
      expect(res.body).toContain("agentscan");
      if (path === "/about") {
        expect(res.body).toContain("What 2.3.1 reads");
        expect(res.body).toContain("Kiro agents are inventory only");
      }
    }
  });

  test("checks and changelog render one h1, canonical, and JSON-LD lists", async () => {
    for (const [path, h1] of [
      ["/checks", `All ${PRODUCT_CHECKS} agentscan checks`],
      ["/changelog", "agentscan changelog"],
      ["/results", "What one run found on a real setup"],
    ] as const) {
      const res = await probe(path, { headers: { Accept: "text/html" } });
      expect(res.status).toBe(200);
      expect(res.body.match(/<h1[\s>]/g)?.length).toBe(1);
      expect(res.body).toContain(h1);
      expect(res.body).toContain(`<link rel="canonical" href="https://agentscan.space${path}"`);
      if (path !== "/results") expect(res.body).toContain('"@type":"ItemList"');
      expect(res.body).toContain('"@type":"BreadcrumbList"');
      const md = await probe(`${path}.md`);
      expect(md.status).toBe(200);
      expect(md.contentType).toMatch(/text\/markdown/);
    }
    const checks = await probe("/checks", { headers: { Accept: "text/html" } });
    expect(checks.body).toContain('id="claude.hook.missing-script"');
    expect(checks.body).toContain("agentscan inference");
    const changelog = await probe("/changelog", { headers: { Accept: "text/html" } });
    expect(changelog.body).toContain('id="v2.3.1"');
    expect(changelog.body).toContain('id="v2.0.0"');
  });

  test("every internal header and footer link resolves", async () => {
    const home = await probe("/", { headers: { Accept: "text/html" } });
    const chrome = [
      home.body.match(/<header[\s\S]*?<\/header>/)?.[0] ?? "",
      home.body.match(/<footer[\s\S]*?<\/footer>/)?.[0] ?? "",
    ].join("");
    const hrefs = new Set([...chrome.matchAll(/href="(\/[^"#]*)"/g)].map((m) => m[1] ?? ""));
    expect(hrefs.has("/results")).toBe(true);
    expect(hrefs.size).toBeGreaterThanOrEqual(8);
    for (const href of hrefs) {
      const res = await probe(href, { headers: { Accept: "text/html" }, redirect: "manual" });
      expect(`${href} ${res.status}`).toBe(`${href} 200`);
    }
  });

  test("the header marks the current page", async () => {
    const res = await probe("/results", { headers: { Accept: "text/html" } });
    expect(res.body).toMatch(/<a[^>]*aria-current="page"[^>]*href="\/results"|<a[^>]*href="\/results"[^>]*aria-current="page"/);
  });
});
