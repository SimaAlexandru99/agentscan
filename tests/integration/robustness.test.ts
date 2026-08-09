import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCheck } from "../../src/commands/check";

/**
 * Cases found by running the CLI against hostile input. Each one used to be
 * silently wrong rather than loud — the failure mode this tool exists to fix.
 */

type JsonReport = {
  root: string;
  resolvedFrom?: string;
  findings: { ruleId: string; severity: string; message: string }[];
};

function project(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "agentscan-robust-"));
  for (const [rel, body] of Object.entries(files)) {
    const path = join(dir, rel);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, body, "utf8");
  }
  return dir;
}

async function report(dir: string): Promise<JsonReport> {
  const result = await runCheck({ dir, json: true, failOn: "never" });
  return JSON.parse(result.stdout) as JsonReport;
}

describe("unreadable input is reported, never swallowed", () => {
  test("a corrupt package.json is an error finding", async () => {
    const dir = project({ "package.json": "{not json" });
    const payload = await report(dir);

    const finding = payload.findings.find((f) => f.ruleId === "config.unreadable");
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("error");
    expect(finding?.message).toContain("package.json");
  });

  test("a corrupt package.json fails --fail-on error", async () => {
    const dir = project({ "package.json": "{not json" });
    const result = await runCheck({ dir, failOn: "error" });
    expect(result.exitCode).toBe(1);
  });

  test("a valid package.json produces no config error", async () => {
    const dir = project({ "package.json": '{"name":"ok"}' });
    const payload = await report(dir);
    expect(payload.findings.filter((f) => f.ruleId === "config.unreadable")).toEqual(
      [],
    );
  });

  test("an unreadable SKILL.md is not misreported as missing frontmatter", async () => {
    const dir = project({
      "package.json": '{"name":"p"}',
      ".agents/skills/x/SKILL.md": "---\nname: x\ndescription: d\n---\n",
    });
    chmodSync(join(dir, ".agents/skills/x/SKILL.md"), 0o000);

    try {
      const payload = await report(dir);
      const ids = payload.findings.map((f) => f.ruleId);

      // the file may well have valid frontmatter — we simply could not read it,
      // and telling the user to add frontmatter sends them to fix a correct file
      expect(ids).not.toContain("skill.missing-frontmatter");
      expect(ids).toContain("config.unreadable");
    } finally {
      chmodSync(join(dir, ".agents/skills/x/SKILL.md"), 0o644);
    }
  });
});

describe("a malformed shape is a finding, not a crash", () => {
  test("a non-string script value does not abort the scan", async () => {
    const dir = project({
      "package.json": '{"name":"x","scripts":{"build":null}}',
    });
    const payload = await report(dir);

    const finding = payload.findings.find(
      (f) => f.ruleId === "config.unreadable",
    );
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("error");
    expect(finding?.message).toContain("package.json");
  });

  test("a non-string dependency range does not abort the scan", async () => {
    const dir = project({
      "package.json": '{"name":"x","dependencies":{"next":15}}',
    });
    const payload = await report(dir);
    expect(
      payload.findings.some((f) => f.ruleId === "config.unreadable"),
    ).toBe(true);
  });

  test("dropped entries are reported by name and count, never by value", async () => {
    const dir = project({
      "package.json":
        '{"name":"x","scripts":{"deploy":{"token":"ghp_abcdefghij0123456789abcd"}}}',
    });
    const result = await runCheck({ dir, json: true, failOn: "never" });
    // whatever a discarded value held must not reach the report
    expect(result.stdout).not.toContain("ghp_abcdefghij0123456789abcd");
    expect(result.stdout).toContain("scripts");
  });

  test("well-formed package.json produces no config error", async () => {
    const dir = project({
      "package.json": '{"name":"x","scripts":{"build":"tsc"},"dependencies":{"next":"16.0.0"}}',
    });
    const payload = await report(dir);
    expect(
      payload.findings.filter((f) => f.ruleId === "config.unreadable"),
    ).toEqual([]);
  });

  test("an MCP file with an unusable shape is reported", async () => {
    const dir = project({
      "package.json": '{"name":"x"}',
      ".mcp.json": '{"mcpServers": []}',
    });
    const payload = await report(dir);
    expect(
      payload.findings.some((f) => f.ruleId === "config.unreadable"),
    ).toBe(true);
  });

  test("an unreadable skills directory is reported", async () => {
    const dir = project({
      "package.json": '{"name":"x"}',
      ".agents/skills/keep/SKILL.md": "---\nname: keep\ndescription: d\n---\n",
    });
    chmodSync(join(dir, ".agents/skills"), 0o000);
    try {
      const payload = await report(dir);
      expect(
        payload.findings.some((f) => f.ruleId === "config.unreadable"),
      ).toBe(true);
    } finally {
      chmodSync(join(dir, ".agents/skills"), 0o755);
    }
  });
});

describe("the frontmatter parser reads what is there", () => {
  test("an empty name: does not capture the next line", async () => {
    const dir = project({
      "package.json": '{"name":"x"}',
      ".agents/skills/s/SKILL.md": "---\nname:\ndescription: A real description\n---\n",
    });
    const payload = await report(dir);
    const ids = payload.findings.map((f) => f.ruleId);

    // `name` is optional, so an empty one is not itself a finding — what
    // matters is that the description was not swallowed into it.
    expect(ids).not.toContain("skill.name-mismatch");
    expect(ids).not.toContain("skill.missing-description");
  });

  test("CRLF line endings do not corrupt the frontmatter block", async () => {
    // The closing fence is "\r\n---"; searching for "\n---" cuts inside it and
    // leaves a stray \r that a strict YAML parser rejects.
    const dir = project({
      "package.json": '{"name":"x"}',
      ".agents/skills/s/SKILL.md":
        "---\r\nname: s\r\ndescription: d\r\nmeta:\r\n  v: \"1\"\r\n---\r\n\r\n# body\r\n",
    });
    const payload = await report(dir);
    expect(payload.findings.map((f) => f.ruleId)).toEqual([]);
  });

  test("a folded scalar description is read, not reported missing", async () => {
    const dir = project({
      "package.json": '{"name":"x"}',
      ".agents/skills/s/SKILL.md":
        "---\nname: s\ndescription: >\n  A folded description\n  spanning lines.\n---\n",
    });
    const payload = await report(dir);
    expect(payload.findings.map((f) => f.ruleId)).toEqual([]);
  });

  test("frontmatter that does not parse is reported as such, not as missing fields", async () => {
    const dir = project({
      "package.json": '{"name":"x"}',
      ".agents/skills/s/SKILL.md": "---\nname: [unclosed\n---\n",
    });
    const payload = await report(dir);
    const ids = payload.findings.map((f) => f.ruleId);

    expect(ids).toContain("config.unreadable");
    // we could not read the fields; claiming they are absent would be a guess
    expect(ids).not.toContain("skill.missing-name");
    expect(ids).not.toContain("skill.missing-description");
  });

  test("a UTF-8 BOM does not hide valid frontmatter", async () => {
    const dir = project({
      "package.json": '{"name":"x"}',
      ".agents/skills/s/SKILL.md": "\uFEFF---\nname: s\ndescription: d\n---\n",
    });
    const payload = await report(dir);
    expect(payload.findings.map((f) => f.ruleId)).not.toContain(
      "skill.missing-frontmatter",
    );
  });
});

describe("only agent definition files count as agents", () => {
  test("dotfiles and non-markdown files are not agents", async () => {
    const dir = project({
      "package.json": '{"name":"x"}',
      ".claude/agents/.gitkeep": "",
      ".claude/agents/.DS_Store": "",
      ".claude/agents/notes.txt": "scratch",
      ".claude/agents/reviewer.md": "---\nname: Reviewer\ndescription: d\n---\n",
    });
    const result = await runCheck({ dir, failOn: "never" });
    expect(result.stdout).toContain("1 agents");
  });

  test("a README in the agents directory is still counted — plan 003 closes this", async () => {
    // Documenting the residue rather than piling on filename heuristics: the
    // principled discriminator is agent frontmatter, which plan 003 reads.
    const dir = project({
      "package.json": '{"name":"x"}',
      ".claude/agents/README.md": "# how these agents work\n",
    });
    const result = await runCheck({ dir, failOn: "never" });
    expect(result.stdout).toContain("1 agents");
  });
});

describe("agent definitions, end to end", () => {
  test("a bare agent file is reported; a complete one is not", async () => {
    const dir = project({
      "package.json": '{"name":"x"}',
      ".claude/agents/bare.md": "# just prose, no frontmatter\n",
      ".claude/agents/good.md":
        "---\nname: Code Reviewer\ndescription: Reviews diffs for correctness\n---\n\n# body\n",
    });
    const payload = await report(dir);
    const agentFindings = payload.findings.filter((f) =>
      f.ruleId.startsWith("agent."),
    );

    expect(agentFindings.map((f) => f.ruleId)).toEqual([
      "agent.missing-frontmatter",
    ]);
    // good.md declares a display name unlike its filename — by design
    expect(JSON.stringify(payload.findings)).not.toContain("good");
  });
});

describe("root resolution is visible", () => {
  test("a directory with no package.json reports which root it walked up to", async () => {
    const parent = project({ "package.json": '{"name":"parent"}' });
    const nested = join(parent, "sub", "deeper");
    mkdirSync(nested, { recursive: true });

    const payload = await report(nested);

    expect(payload.root).toBe(parent);
    expect(payload.resolvedFrom).toBe(nested);
  });

  test("resolvedFrom is absent when the directory is the root", async () => {
    const dir = project({ "package.json": '{"name":"here"}' });
    const payload = await report(dir);

    expect(payload.root).toBe(dir);
    expect(payload.resolvedFrom).toBeUndefined();
  });

  test("text report names the walked-up root", async () => {
    const parent = project({ "package.json": '{"name":"parent"}' });
    const nested = join(parent, "sub");
    mkdirSync(nested, { recursive: true });

    const result = await runCheck({ dir: nested, failOn: "never" });

    expect(result.stdout).toContain("no package.json in");
    expect(result.stdout).toContain(parent);
  });
});
