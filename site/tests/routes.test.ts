import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { varyIncludesAccept } from "../lib/accept";
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
    for (const path of ["/", "/docs", "/about", "/contact", "/privacy"]) {
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
    expect(res.body).toContain("1.1.0");
    expect(res.body).toContain("72 checks");
    expect(res.body).not.toContain("Alpha");
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
    }
  });
});
