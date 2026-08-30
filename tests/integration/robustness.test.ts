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
  findings: { id: string; ruleId: string; severity: string; message: string }[];
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

describe("a parser error never carries source text out", () => {
  // A parser quotes the offending fragment back. When the unparseable file is
  // an MCP config or a SKILL.md, that fragment can be a credential — and the
  // README tells people to pipe --json into CI logs.
  const CANARY = "ghp_S3CR3TCANARYabcdefghij0123456789";

  test("an unquoted token in malformed JSON is not echoed", async () => {
    const dir = project({
      "package.json": '{"name":"x"}',
      ".mcp.json": `{"K": ${CANARY}}`,
    });
    const text = await runCheck({ dir, failOn: "never" });
    const json = await runCheck({ dir, json: true, failOn: "never" });

    expect(text.stdout).not.toContain("S3CR3TCANARY");
    expect(json.stdout).not.toContain("S3CR3TCANARY");
    expect(json.stdout).toContain("config.unreadable");
  });

  test("an unresolved YAML alias in frontmatter is not echoed", async () => {
    const dir = project({
      "package.json": '{"name":"x"}',
      ".agents/skills/s/SKILL.md": `---\nname: s\nk: *${CANARY}\n---\n`,
    });
    const text = await runCheck({ dir, failOn: "never" });
    const json = await runCheck({ dir, json: true, failOn: "never" });

    expect(text.stdout).not.toContain("S3CR3TCANARY");
    expect(json.stdout).not.toContain("S3CR3TCANARY");
  });

  test("the position a parser reports survives — it is the actionable part", async () => {
    const dir = project({
      "package.json": '{"name":"x"}',
      ".agents/skills/s/SKILL.md": "---\nname: [unclosed\n---\n",
    });
    const json = await runCheck({ dir, json: true, failOn: "never" });
    const payload = JSON.parse(json.stdout) as {
      findings: {
        ruleId: string;
        evidence: { kind: string; value: string }[];
      }[];
    };
    const detail = payload.findings
      .find((f) => f.ruleId === "config.unreadable")
      ?.evidence.find((e) => e.kind === "detail")?.value;

    expect(detail).toBeDefined();
    expect(detail).toMatch(/line \d+/);
  });
});

describe("never claim anything about a file that failed to open", () => {
  test("an agent whose frontmatter will not parse is not also called description-less", async () => {
    const dir = project({
      "package.json": '{"name":"x"}',
      // an unquoted colon — the commonest YAML slip in these files
      ".claude/agents/reviewer.md":
        "---\nname: reviewer\ndescription: Use when reviewing code: correctness\n---\n",
    });
    const ids = (await report(dir)).findings.map((f) => f.ruleId);

    expect(ids).toContain("config.unreadable");
    expect(ids).not.toContain("claude.agent.missing-description");
  });

  test("an unreadable agent file is not called frontmatter-less", async () => {
    const dir = project({
      "package.json": '{"name":"x"}',
      ".claude/agents/a.md": "---\nname: a\ndescription: d\n---\n",
    });
    chmodSync(join(dir, ".claude/agents/a.md"), 0o000);
    try {
      const ids = (await report(dir)).findings.map((f) => f.ruleId);
      expect(ids).toContain("config.unreadable");
      expect(ids).not.toContain("claude.agent.missing-frontmatter");
    } finally {
      chmodSync(join(dir, ".claude/agents/a.md"), 0o644);
    }
  });

  test("an unreadable skill directory is not called SKILL.md-less", async () => {
    const dir = project({
      "package.json": '{"name":"x"}',
      ".agents/skills/locked/SKILL.md": "---\nname: locked\ndescription: d\n---\n",
    });
    chmodSync(join(dir, ".agents/skills/locked"), 0o000);
    try {
      const ids = (await report(dir)).findings.map((f) => f.ruleId);
      // existsSync cannot tell ENOENT from EACCES; the file is right there
      expect(ids).toContain("config.unreadable");
      expect(ids).not.toContain("skill.missing-skill-md");
    } finally {
      chmodSync(join(dir, ".agents/skills/locked"), 0o755);
    }
  });
});

describe("directories that are not skills", () => {
  test("dotfile containers and node_modules are skipped", async () => {
    const dir = project({
      "package.json": '{"name":"x"}',
      ".agents/skills/.system/inner/SKILL.md": "---\nname: inner\ndescription: d\n---\n",
      ".agents/skills/node_modules/pkg/SKILL.md": "---\nname: p\ndescription: d\n---\n",
      ".agents/skills/real/SKILL.md": "---\nname: real\ndescription: d\n---\n",
    });
    const payload = await report(dir);

    // `.system` under ~/.codex/skills holds six working skills; the old
    // suggestion was to delete it
    expect(payload.findings).toEqual([]);
    expect(JSON.stringify(payload)).not.toContain(".system");
  });
});

describe("unreadable input is reported, never swallowed", () => {
  test("a whole dependencies field of the wrong shape is reported", async () => {
    const dir = project({
      "package.json": '{"name":"x","dependencies":"notanobject"}',
    });
    const payload = await report(dir);
    expect(
      payload.findings.some((f) => f.ruleId === "config.unreadable"),
    ).toBe(true);
  });

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
      expect(ids).not.toContain("claude.skill.missing-frontmatter");
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
    expect(ids).not.toContain("claude.skill.missing-description");
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
    expect(ids).not.toContain("claude.skill.missing-description");
  });

  test("a UTF-8 BOM does not hide valid frontmatter", async () => {
    const dir = project({
      "package.json": '{"name":"x"}',
      ".agents/skills/s/SKILL.md": "\uFEFF---\nname: s\ndescription: d\n---\n",
    });
    const payload = await report(dir);
    expect(payload.findings.map((f) => f.ruleId)).not.toContain(
      "claude.skill.missing-frontmatter",
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
        "---\nname: code-reviewer\ndescription: Reviews diffs for correctness\n---\n\n# body\n",
    });
    const payload = await report(dir);
    const agentFindings = payload.findings.filter((f) =>
      f.ruleId.includes("agent."),
    );

    expect(agentFindings.map((f) => f.ruleId)).toEqual([
      "claude.agent.missing-frontmatter",
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

  test("a .claude-only tree without package.json is still scannable", async () => {
    const dir = project({
      ".claude/settings.json": JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              hooks: [
                {
                  type: "command",
                  command: ".claude/hooks/guard-destructive-bash.js",
                },
              ],
            },
          ],
        },
      }),
    });

    const payload = await report(dir);
    expect(payload.root).toBe(dir);
    expect(payload.resolvedFrom).toBeUndefined();
    expect(
      payload.findings.some((f) => f.ruleId === "claude.hook.missing-script"),
    ).toBe(true);
  });

  test("a directory with neither package.json nor agent config fails clearly", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agentscan-empty-"));
    await expect(runCheck({ dir, failOn: "never" })).rejects.toThrow(
      /No package\.json or agent configuration found/,
    );
  });
});

describe("suppressing a single finding", () => {
  test("ignoreFindings drops exactly the listed id and nothing else", async () => {
    const dir = project({
      "package.json": '{"name":"x"}',
      ".claude/skills/a/SKILL.md": "# no frontmatter\n",
      ".claude/skills/b/SKILL.md": "# no frontmatter either\n",
    });

    const before = await report(dir);
    const ids = before.findings.map((f) => f.id).sort();
    expect(ids).toHaveLength(2);

    writeFileSync(
      join(dir, ".agentscanrc.json"),
      JSON.stringify({ ignoreFindings: [ids[0]] }),
      "utf8",
    );

    const after = await report(dir);
    // one false positive must cost one line of config, not a whole check
    expect(after.findings.map((f) => f.id)).toEqual([ids[1] as string]);
  });

  test("an ignored finding cannot fail the build", async () => {
    const dir = project({
      "package.json": '{"name":"x"}',
      ".claude/skills/a/SKILL.md": "# no frontmatter\n",
    });
    const id = (await report(dir)).findings[0]?.id;
    expect(id).toBeDefined();

    writeFileSync(
      join(dir, ".agentscanrc.json"),
      JSON.stringify({ ignoreFindings: [id] }),
      "utf8",
    );
    const result = await runCheck({ dir, failOn: "warning" });
    expect(result.exitCode).toBe(0);
  });
});
