import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  fetchUrlFor,
  normalizeSpecText,
  SPEC_HASHES_PATH,
  SPEC_SURFACES,
  specContentHash,
  surfacesForUrl,
  uniqueSurfaceUrls,
  type SpecHashBaseline,
} from "../../scripts/spec-surfaces";

/**
 * Offline contract for the content-hash half of `bun run spec:check`
 * (plans/038). Nothing here touches the network: the fetch stays in the
 * release-time script, and the scan path never sees any of this.
 */

describe("normalizeSpecText", () => {
  test("drops scripts, styles, comments, and site furniture", () => {
    const html = `
      <html><head><style>.x{color:red}</style><script>window.__b="build-9f3a"</script></head>
      <body>
        <nav>Docs Search ⌘K</nav>
        <header>Product menu</header>
        <!-- deploy 2026-09-02T17:00 -->
        <main><h1>Hooks</h1><p>type is <code>&quot;command&quot;</code> or <code>&quot;http&quot;</code>.</p></main>
        <footer>Last build 12345</footer>
      </body></html>`;
    expect(normalizeSpecText(html)).toBe('Hooks\ntype is "command" or "http" .');
  });

  test("keeps only the main region when one exists", () => {
    const html = `<body><div>Sidebar link list</div><main><p>Spec line</p></main><aside>Related</aside></body>`;
    expect(normalizeSpecText(html)).toBe("Spec line");
  });

  test("falls back to article, then body, then the whole document", () => {
    expect(normalizeSpecText(`<body><article><p>A</p></article><p>outside</p></body>`)).toBe("A");
    expect(normalizeSpecText(`<body><p>B</p></body>`)).toBe("B");
    expect(normalizeSpecText(`# Markdown heading\n\nPlain  text   here.`)).toBe(
      "# Markdown heading Plain text here.",
    );
  });

  test("is stable under whitespace and attribute churn", () => {
    const a = `<main class="a1"><p>Keep   rules under 500 lines</p>\n\n<p>Second</p></main>`;
    const b = `<main class="b2" data-v="9"><p>Keep rules under\n500 lines</p><p>Second</p></main>`;
    expect(normalizeSpecText(a)).toBe(normalizeSpecText(b));
  });

  test("changes when a sentence changes", () => {
    const before = normalizeSpecText(`<main><p>type accepts http, sse, ws</p></main>`);
    const after = normalizeSpecText(`<main><p>type accepts http, streamable-http, sse, ws</p></main>`);
    expect(before).not.toBe(after);
    expect(specContentHash(before)).not.toBe(specContentHash(after));
  });

  test("unescapes numeric and named entities", () => {
    expect(normalizeSpecText(`<main>a &amp; b &#60;c&#x3E; d&nbsp;e</main>`)).toBe("a & b <c> d e");
  });
});

describe("specContentHash", () => {
  test("is 16 lowercase hex characters and deterministic", () => {
    const hash = specContentHash("Keep rules under 500 lines");
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
    expect(specContentHash("Keep rules under 500 lines")).toBe(hash);
    expect(specContentHash("Keep rules under 501 lines")).not.toBe(hash);
  });
});

describe("fetchUrlFor", () => {
  test("rewrites a GitHub blob page to its raw file", () => {
    expect(
      fetchUrlFor("https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md"),
    ).toBe("https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/tools/mcp-server.md");
  });

  test("leaves every other URL alone", () => {
    for (const url of uniqueSurfaceUrls()) {
      if (!url.startsWith("https://github.com/")) {
        expect(fetchUrlFor(url)).toBe(url);
      }
    }
  });
});

describe("scripts/spec-hashes.json baseline", () => {
  const baseline = JSON.parse(readFileSync(SPEC_HASHES_PATH, "utf8")) as SpecHashBaseline;
  const urls = uniqueSurfaceUrls();

  test("has one entry per unique surface URL, no more and no fewer", () => {
    expect(Object.keys(baseline).sort()).toEqual([...urls].sort());
  });

  test("every entry is a 16-hex hash with an ISO date", () => {
    for (const [url, entry] of Object.entries(baseline)) {
      expect(url).toMatch(/^https:\/\//);
      expect(entry.hash).toMatch(/^[0-9a-f]{16}$/);
      expect(entry.recorded).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  test("every URL resolves to at least one surface, and shared pages fetch once", () => {
    for (const url of urls) {
      expect(surfacesForUrl(url).length).toBeGreaterThan(0);
    }
    expect(urls.length).toBeLessThan(SPEC_SURFACES.length);
  });

  test("the baseline file is sorted by URL so diffs stay readable", () => {
    const keys = Object.keys(baseline);
    expect(keys).toEqual([...keys].sort());
  });
});
