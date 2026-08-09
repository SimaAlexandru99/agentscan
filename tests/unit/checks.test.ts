import { describe, expect, test } from "bun:test";
import type { Facts, HookFact, McpFact, SkillFact } from "../../src/facts/types";
import { runChecks, STRUCTURAL_CHECKS } from "../../src/checks/index";

function skill(partial: Partial<SkillFact> & Pick<SkillFact, "id">): SkillFact {
  return {
    path: `.agents/skills/${partial.id}`,
    source: "project",
    hasSkillMd: true,
    hasFrontmatter: true,
    ...partial,
  };
}

function baseFacts(overrides: Partial<Facts> = {}): Facts {
  return {
    root: "/tmp/proj",
    packageManager: "bun",
    dependencies: {},
    devDependencies: {},
    scripts: {},
    configs: {},
    skills: [],
    agents: [],
    hooks: [],
    mcp: [],
    policyFiles: [],
    lockedSkills: [],
    hasSkillsLock: false,
    configErrors: [],
    ...overrides,
  };
}

function ids(facts: Facts): string[] {
  return runChecks(facts).map((f) => f.ruleId);
}

describe("config errors", () => {
  test("invalid JSON is an error finding, not a silent skip", () => {
    const findings = runChecks(
      baseFacts({
        configErrors: [
          {
            path: "/tmp/proj/.mcp.json",
            kind: "invalid-json",
            detail: "Unexpected token }",
          },
        ],
      }),
    );
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.ruleId).toBe("config.unreadable");
    expect(f.severity).toBe("error");
    // the kind and detail disambiguate several failures in one file
    expect(f.subject).toStartWith("config:/tmp/proj/.mcp.json#");
    expect(f.message).toContain("not valid JSON");
  });
});

describe("hook checks", () => {
  const hook = (partial: Partial<HookFact>): HookFact => ({
    name: "PreToolUse",
    path: "/tmp/proj/.claude/settings.json",
    event: "PreToolUse",
    ...partial,
  });

  test("missing hook script is an error — the hook silently does nothing", () => {
    const findings = runChecks(
      baseFacts({
        hooks: [
          hook({
            command: "node .claude/hooks/protect-env.js",
            scriptPath: ".claude/hooks/protect-env.js",
            scriptExists: false,
          }),
        ],
      }),
    );
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.ruleId).toBe("hook.missing-script");
    expect(f.severity).toBe("error");
    expect(f.action).toBe("warn");
    expect(f.subject).toBe("hook:PreToolUse:.claude/hooks/protect-env.js");
  });

  test("unknown event name is an error — the hook never fires", () => {
    const findings = runChecks(
      baseFacts({
        hooks: [hook({ name: "PreToolUce", event: "PreToolUce" })],
      }),
    );
    expect(findings.map((f) => f.ruleId)).toEqual(["hook.unknown-event"]);
    expect(findings[0]!.severity).toBe("error");
    expect(findings[0]!.subject).toBe("hook:PreToolUce");
    expect(findings[0]!.message).toContain("PreToolUce");
  });

  test("one finding per bad event, not per registered command", () => {
    const findings = runChecks(
      baseFacts({
        hooks: [
          hook({ event: "PreToolUce", command: "node a.js" }),
          hook({ event: "PreToolUce", command: "node b.js" }),
          hook({ event: "PreToolUce", command: "node c.js" }),
        ],
      }),
    );
    expect(findings).toHaveLength(1);
  });

  test("every real event name is accepted", () => {
    // The full set from https://code.claude.com/docs/en/hooks — an incomplete
    // list here means reporting a working hook as dead, at severity error.
    const events = [
      "SessionStart",
      "Setup",
      "UserPromptSubmit",
      "UserPromptExpansion",
      "PreToolUse",
      "PermissionRequest",
      "PermissionDenied",
      "PostToolUse",
      "PostToolUseFailure",
      "PostToolBatch",
      "Notification",
      "MessageDisplay",
      "SubagentStart",
      "SubagentStop",
      "TaskCreated",
      "TaskCompleted",
      "Stop",
      "StopFailure",
      "TeammateIdle",
      "InstructionsLoaded",
      "ConfigChange",
      "CwdChanged",
      "DirectoryAdded",
      "FileChanged",
      "WorktreeCreate",
      "WorktreeRemove",
      "PreCompact",
      "PostCompact",
      "Elicitation",
      "ElicitationResult",
      "SessionEnd",
    ];
    const findings = runChecks(
      baseFacts({ hooks: events.map((event) => hook({ event, name: event })) }),
    );
    expect(findings).toEqual([]);
  });

  test("existing script and unresolvable command produce nothing", () => {
    const findings = runChecks(
      baseFacts({
        hooks: [
          hook({ command: "node ok.js", scriptPath: "ok.js", scriptExists: true }),
          hook({ command: "rtk git status" }),
          hook({}),
        ],
      }),
    );
    expect(findings).toEqual([]);
  });
});

describe("skill structure checks", () => {
  test("missing SKILL.md", () => {
    const findings = runChecks(
      baseFacts({
        skills: [skill({ id: "grouping-folder", hasSkillMd: false, hasFrontmatter: false })],
      }),
    );
    expect(findings.map((f) => f.ruleId)).toEqual(["skill.missing-skill-md"]);
    expect(findings[0]!.severity).toBe("warning");
  });

  test("missing frontmatter reported once, not also as missing name", () => {
    const findings = runChecks(
      baseFacts({ skills: [skill({ id: "context7-mcp", hasFrontmatter: false })] }),
    );
    expect(findings.map((f) => f.ruleId)).toEqual(["skill.missing-frontmatter"]);
  });

  test("a name that differs from the directory is not a finding", () => {
    // `name` is an optional display name that defaults to the directory; the
    // command comes from the directory, so a difference is by design.
    const findings = runChecks(
      baseFacts({
        skills: [
          skill({
            id: "composition-patterns",
            frontmatterName: "vercel-composition-patterns",
            description: "d",
          }),
        ],
      }),
    );
    expect(findings).toEqual([]);
  });

  test("frontmatter with no name at all is not a finding", () => {
    const findings = runChecks(
      baseFacts({ skills: [skill({ id: "s", description: "d" })] }),
    );
    expect(findings).toEqual([]);
  });

  test("matching name and description produce nothing", () => {
    const findings = runChecks(
      baseFacts({
        skills: [skill({ id: "seo", frontmatterName: "seo", description: "d" })],
      }),
    );
    expect(findings).toEqual([]);
  });

});

describe("skills-lock integrity", () => {
  test("skill on disk but not in lock is unmanaged", () => {
    const findings = runChecks(
      baseFacts({
        hasSkillsLock: true,
        lockedSkills: [{ id: "seo" }],
        skills: [
          skill({ id: "seo", frontmatterName: "seo", description: "seo help" }),
          skill({ id: "my-local", frontmatterName: "my-local", description: "local help" }),
        ],
      }),
    );
    expect(findings.map((f) => f.ruleId)).toEqual(["skill.not-in-lock"]);
    expect(findings[0]!.subject).toBe("skill:my-local");
    expect(findings[0]!.severity).toBe("info");
  });

  test("locked skill missing from disk is a broken install", () => {
    const findings = runChecks(
      baseFacts({
        hasSkillsLock: true,
        lockedSkills: [{ id: "seo", source: "addyosmani/web-quality-skills" }],
        skills: [],
      }),
    );
    expect(findings.map((f) => f.ruleId)).toEqual(["skill.locked-not-installed"]);
    expect(findings[0]!.severity).toBe("warning");
    expect(findings[0]!.message).toContain("addyosmani/web-quality-skills");
  });

  test("a global skill is not judged against the project lockfile", () => {
    const findings = runChecks(
      baseFacts({
        hasSkillsLock: true,
        lockedSkills: [{ id: "seo" }],
        skills: [
          skill({ id: "seo", frontmatterName: "seo", description: "d" }),
          skill({
            id: "browser-use",
            source: "global",
            path: "/home/u/.claude/skills/browser-use",
            frontmatterName: "browser-use",
            description: "d",
          }),
        ],
      }),
    );
    // a project lockfile cannot pin a skill that lives in the user's home dir
    expect(findings).toEqual([]);
  });

  test("structural checks still apply to global skills", () => {
    const findings = runChecks(
      baseFacts({
        skills: [
          skill({
            id: "broken",
            source: "global",
            path: "/home/u/.claude/skills/broken",
            hasFrontmatter: false,
          }),
        ],
      }),
    );
    // malformed is malformed wherever it lives
    expect(findings.map((f) => f.ruleId)).toEqual(["skill.missing-frontmatter"]);
    expect(
      findings[0]!.evidence.some(
        (e) => e.kind === "source" && e.value === "global",
      ),
    ).toBe(true);
  });

  test("skill.no-lockfile counts project skills only", () => {
    const findings = runChecks(
      baseFacts({
        hasSkillsLock: false,
        skills: [
          skill({ id: "p", frontmatterName: "p", description: "project one" }),
          skill({
            id: "g",
            source: "global",
            path: "/home/u/.claude/skills/g",
            frontmatterName: "g",
            description: "global one",
          }),
        ],
      }),
      { requireLock: true },
    );
    expect(findings.map((f) => f.ruleId)).toEqual(["skill.no-lockfile"]);
    expect(findings[0]!.message).toContain("1 skill ");
  });

  test("no lockfile → no lock findings at all", () => {
    const findings = runChecks(
      baseFacts({
        hasSkillsLock: false,
        skills: [skill({ id: "whatever", frontmatterName: "whatever", description: "d" })],
      }),
    );
    expect(findings).toEqual([]);
  });

  test("skills present with no lockfile is flagged once, not per skill", () => {
    const findings = runChecks(
      baseFacts({
        hasSkillsLock: false,
        skills: Array.from({ length: 5 }, (_, i) =>
          skill({ id: `s${i}`, frontmatterName: `s${i}`, description: `d${i}` }),
        ),
      }),
      { requireLock: true },
    );
    expect(findings.map((f) => f.ruleId)).toEqual(["skill.no-lockfile"]);
    expect(findings[0]!.message).toContain("5");
  });
});

describe("broken bundled references", () => {
  test("a body pointing at a missing file is a warning naming it", () => {
    const findings = runChecks(
      baseFacts({
        skills: [
          skill({
            id: "s",
            frontmatterName: "s",
            description: "d",
            brokenReferences: ["references/gone.md", "scripts/also-gone.ts"],
          }),
        ],
      }),
    );
    expect(findings.map((f) => f.ruleId)).toEqual(["skill.broken-reference"]);
    expect(findings[0]!.severity).toBe("warning");
    expect(findings[0]!.message).toContain("references/gone.md");
    expect(findings[0]!.message).toContain("2 files");
  });

  test("more than three are summarised, not dumped", () => {
    const findings = runChecks(
      baseFacts({
        skills: [
          skill({
            id: "s",
            frontmatterName: "s",
            description: "d",
            brokenReferences: ["a/1.md", "a/2.md", "a/3.md", "a/4.md", "a/5.md"],
          }),
        ],
      }),
    );
    expect(findings[0]!.message).toContain("+2 more");
  });

  test("no broken references produces nothing", () => {
    const findings = runChecks(
      baseFacts({
        skills: [
          skill({ id: "s", frontmatterName: "s", description: "first" }),
          skill({
            id: "t",
            frontmatterName: "t",
            description: "second",
            brokenReferences: [],
          }),
        ],
      }),
    );
    expect(findings).toEqual([]);
  });
});

describe("agent definitions", () => {
  const agent = (
    name: string,
    extra: { hasFrontmatter?: boolean; description?: string } = {},
  ) => ({
    name,
    path: `.claude/agents/${name}.md`,
    hasFrontmatter: true,
    ...extra,
  });

  test("no frontmatter block is a warning", () => {
    const findings = runChecks(
      baseFacts({ agents: [agent("reviewer", { hasFrontmatter: false })] }),
    );
    expect(findings.map((f) => f.ruleId)).toEqual(["agent.missing-frontmatter"]);
    expect(findings[0]!.severity).toBe("warning");
    expect(findings[0]!.subject).toBe("agent:reviewer");
  });

  test("frontmatter with no description is info", () => {
    const findings = runChecks(baseFacts({ agents: [agent("reviewer")] }));
    expect(findings.map((f) => f.ruleId)).toEqual(["agent.missing-description"]);
    expect(findings[0]!.severity).toBe("info");
  });

  test("a complete agent produces nothing", () => {
    expect(
      runChecks(baseFacts({ agents: [agent("reviewer", { description: "Reviews code" })] })),
    ).toEqual([]);
  });

  test("missing frontmatter is reported once, not also as missing description", () => {
    const findings = runChecks(
      baseFacts({ agents: [agent("x", { hasFrontmatter: false })] }),
    );
    expect(findings).toHaveLength(1);
  });

  test("a display name unlike the filename is NOT a finding", () => {
    // 16 of 34 real agent files declare a display name that differs from the
    // filename (`name: API Platform Engineer`). Nothing keys on the filename.
    // Regression guard against re-adding the check plan 003 prohibits.
    const findings = runChecks(
      baseFacts({
        agents: [
          {
            name: "engineering-api-platform-engineer",
            path: ".claude/agents/engineering-api-platform-engineer.md",
            hasFrontmatter: true,
            frontmatterName: "API Platform Engineer",
            description: "Designs API platforms",
          },
        ],
      }),
    );
    expect(findings).toEqual([]);
  });
});

describe("skills an agent cannot tell apart", () => {
  const desc = (id: string, description: string) =>
    skill({ id, frontmatterName: id, description });

  test("two identical descriptions are one finding naming both", () => {
    const findings = runChecks(
      baseFacts({
        skills: [desc("firebase-basics", "Firebase help"), desc("firebase-firestore", "Firebase help")],
      }),
    );
    expect(findings.map((f) => f.ruleId)).toEqual(["skill.duplicate-description"]);
    expect(findings[0]!.subject).toBe("skills:firebase-basics firebase-firestore");
    expect(findings[0]!.severity).toBe("warning");
    expect(findings[0]!.message).toContain("firebase-basics");
    expect(findings[0]!.message).toContain("firebase-firestore");
  });

  test("three sharing one description stay one finding", () => {
    const findings = runChecks(
      baseFacts({ skills: [desc("a", "same"), desc("b", "same"), desc("c", "same")] }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.subject).toBe("skills:a b c");
  });

  test("whitespace and case differences still collide", () => {
    const findings = runChecks(
      baseFacts({ skills: [desc("a", "  Deploy   the App "), desc("b", "deploy the app")] }),
    );
    expect(findings).toHaveLength(1);
  });

  test("different descriptions produce nothing", () => {
    expect(
      runChecks(baseFacts({ skills: [desc("a", "one"), desc("b", "two")] })),
    ).toEqual([]);
  });

  test("a skill with no description is left to skill.missing-description", () => {
    const findings = runChecks(
      baseFacts({ skills: [skill({ id: "a", frontmatterName: "a" }), skill({ id: "b", frontmatterName: "b" })] }),
    );
    expect(findings.map((f) => f.ruleId).sort()).toEqual([
      "skill.missing-description",
      "skill.missing-description",
    ]);
  });

  test("two separate colliding pairs are two findings, in a stable order", () => {
    const findings = runChecks(
      baseFacts({
        skills: [desc("z1", "beta"), desc("a1", "alpha"), desc("a2", "alpha"), desc("z2", "beta")],
      }),
    );
    expect(findings.map((f) => f.subject)).toEqual([
      "skills:a1 a2",
      "skills:z1 z2",
    ]);
  });

  test("global skills are not the project's to reconcile", () => {
    const g = (id: string) => ({
      ...desc(id, "same"),
      source: "global" as const,
      path: `/home/u/.claude/skills/${id}`,
    });
    expect(runChecks(baseFacts({ skills: [g("a"), g("b")] }))).toEqual([]);
  });
});

describe("skill description budget", () => {
  const withDesc = (id: string, len: number) =>
    skill({ id, description: "x".repeat(len), frontmatterName: id });

  test("under the ceiling produces nothing", () => {
    const findings = runChecks(
      baseFacts({ skills: [withDesc("a", 100)] }),
      { skillDescriptionBytes: 1000 },
    );
    expect(findings).toEqual([]);
  });

  test("over the ceiling is one info finding naming the totals", () => {
    const findings = runChecks(
      baseFacts({ skills: [withDesc("a", 600), withDesc("b", 601)] }),
      { skillDescriptionBytes: 1000 },
    );
    expect(findings.map((f) => f.ruleId)).toEqual(["skill.description-budget"]);
    expect(findings[0]!.severity).toBe("info");
    expect(findings[0]!.message).toContain("2 skills");
  });

  test("global skills do not count against the project budget", () => {
    const g = {
      ...withDesc("g", 5000),
      source: "global" as const,
      path: "/home/u/.claude/skills/g",
    };
    expect(
      runChecks(baseFacts({ skills: [g] }), { skillDescriptionBytes: 1000 }),
    ).toEqual([]);
  });

  test("no ceiling configured means no check", () => {
    expect(
      runChecks(baseFacts({ skills: [withDesc("a", 99_999)] })),
    ).toEqual([]);
  });
});

describe("review regressions", () => {
  test("the same guard under two matchers is one finding", () => {
    const h = (matcher: string) => ({
      name: "PreToolUse",
      path: `/p/.claude/settings.json#${matcher}`,
      event: "PreToolUse",
      command: "./scripts/guard.sh",
      scriptPath: "./scripts/guard.sh",
      scriptExists: false,
    });
    expect(runChecks(baseFacts({ hooks: [h("Bash"), h("Write")] }))).toHaveLength(1);
  });

  test("one MCP name in two files gives two distinct ids", () => {
    const s = (path: string) => ({
      name: "db",
      path,
      hasCommand: false,
      hasUrl: false,
      literalEnvKeys: [] as string[],
      raw: "{}",
    });
    const f = runChecks(baseFacts({ mcp: [s("/p/.mcp.json"), s("/p/mcp.json")] }));
    expect(f).toHaveLength(2);
    expect(new Set(f.map((x) => x.id)).size).toBe(2);
  });

  test("a hyphenated package slug is not a leaked credential", () => {
    expect(
      runChecks(
        baseFacts({
          mcp: [
            {
              name: "tk",
              path: "/p/.mcp.json",
              hasCommand: true,
              hasUrl: false,
              literalEnvKeys: [],
              raw: '{"args":["--from","git+https://github.com/acme/sk-mcp-server-toolkit"]}',
            },
          ],
        }),
      ),
    ).toEqual([]);
  });

  test("a real OpenAI-shaped key still fires and is never echoed", () => {
    const f = runChecks(
      baseFacts({
        mcp: [
          {
            name: "ai",
            path: "/p/.mcp.json",
            hasCommand: true,
            hasUrl: false,
            literalEnvKeys: [],
            raw: '{"env":{"K":"sk-proj0123456789abcdefghij"}}',
          },
        ],
      }),
    );
    expect(f.map((x) => x.ruleId)).toEqual(["mcp.hardcoded-secret"]);
    expect(JSON.stringify(f)).not.toContain("proj0123456789");
  });

  test("skill ids containing + do not collide", () => {
    const d = (id: string, description: string) =>
      skill({ id, frontmatterName: id, description });
    const f = runChecks(
      baseFacts({
        skills: [d("a+b", "Alpha"), d("c", "Alpha"), d("a", "Beta"), d("b+c", "Beta")],
      }),
    );
    expect(f).toHaveLength(2);
    expect(new Set(f.map((x) => x.id)).size).toBe(2);
  });

  test("a directory with no SKILL.md does not count toward the byte budget", () => {
    const f = runChecks(
      baseFacts({
        skills: [
          skill({ id: "s", frontmatterName: "s", description: "short" }),
          skill({
            id: "a-very-long-abandoned-directory-name-goes-here",
            hasSkillMd: false,
            hasFrontmatter: false,
          }),
        ],
      }),
      { skillDescriptionBytes: 40 },
    );
    expect(f.map((x) => x.ruleId)).toEqual(["skill.missing-skill-md"]);
  });

  test("the budget counts bytes, not UTF-16 units", () => {
    const f = runChecks(
      baseFacts({
        skills: [skill({ id: "s", frontmatterName: "s", description: "é".repeat(30) })],
      }),
      { skillDescriptionBytes: 40 },
    );
    // 30 x 2 bytes + 1 = 61 > 40; `.length` would have said 31
    expect(f.map((x) => x.ruleId)).toEqual(["skill.description-budget"]);
  });
});

describe("mcp checks", () => {
  const mcp = (partial: Partial<McpFact> & Pick<McpFact, "name">): McpFact => ({
    path: "/tmp/proj/.mcp.json",
    hasCommand: true,
    hasUrl: false,
    literalEnvKeys: [],
    raw: "{}",
    ...partial,
  });

  test("server with neither command nor url can never start", () => {
    const findings = runChecks(
      baseFacts({ mcp: [mcp({ name: "broken", hasCommand: false })] }),
    );
    expect(findings.map((f) => f.ruleId)).toEqual(["mcp.no-launch"]);
    expect(findings[0]!.severity).toBe("error");
  });

  test("a url with a transport type is fine", () => {
    const findings = runChecks(
      baseFacts({
        mcp: [
          mcp({
            name: "remote",
            hasCommand: false,
            hasUrl: true,
            transport: "http",
          }),
        ],
      }),
    );
    expect(findings).toEqual([]);
  });

  test("a url with no transport type is an error — Claude Code skips it", () => {
    const findings = runChecks(
      baseFacts({
        mcp: [mcp({ name: "remote", hasCommand: false, hasUrl: true })],
      }),
    );
    expect(findings.map((f) => f.ruleId)).toEqual(["mcp.url-without-type"]);
    expect(findings[0]!.severity).toBe("error");
  });

  test("token-shaped literal in config is an error", () => {
    const findings = runChecks(
      baseFacts({
        mcp: [
          mcp({
            name: "gh",
            raw: '{"env":{"GITHUB_TOKEN":"ghp_abcdefghij0123456789abcd"}}',
          }),
        ],
      }),
    );
    expect(findings.map((f) => f.ruleId)).toEqual(["mcp.hardcoded-secret"]);
    expect(findings[0]!.severity).toBe("error");
    // the secret itself must never be echoed back
    expect(findings[0]!.message).not.toContain("ghp_abcdefghij0123456789abcd");
    expect(JSON.stringify(findings[0]!)).not.toContain("abcdefghij0123456789");
  });

  test("an Anthropic key is labelled Anthropic, not OpenAI", () => {
    const findings = runChecks(
      baseFacts({
        mcp: [
          mcp({
            name: "svc",
            raw: '{"env":{"K":"sk-ant-api03-ABCDEFGHIJKLMNOP"}}',
          }),
        ],
      }),
    );
    expect(findings[0]!.ruleId).toBe("mcp.hardcoded-secret");
    // rotating at the wrong provider is the worst failure for this finding
    expect(findings[0]!.message).toContain("Anthropic");
    expect(findings[0]!.message).not.toContain("OpenAI");
    expect(JSON.stringify(findings[0])).not.toContain("ABCDEFGHIJKLMNOP");
  });

  test("literal env value flagged as possible secret", () => {
    const findings = runChecks(
      baseFacts({
        mcp: [mcp({ name: "svc", literalEnvKeys: ["API_KEY"] })],
      }),
    );
    expect(findings.map((f) => f.ruleId)).toEqual(["mcp.literal-env"]);
    expect(findings[0]!.message).toContain("API_KEY");
  });

  test("${VAR} indirection produces nothing", () => {
    const findings = runChecks(
      baseFacts({
        mcp: [mcp({ name: "svc", raw: '{"env":{"API_KEY":"${API_KEY}"}}' })],
      }),
    );
    expect(findings).toEqual([]);
  });
});

describe("STRUCTURAL_CHECKS stays in sync with what runChecks emits", () => {
  test("declared ids and emitted ids are the same set", () => {
    const withBudget = skill({
      id: "big",
      frontmatterName: "big",
      description: "x".repeat(20_000),
    });

    // `skill.no-lockfile` needs no lockfile while the lock checks need one, so
    // the emitted set is the union of two runs.
    const withLock = baseFacts({
      configErrors: [
        { path: "/tmp/proj/.mcp.json", kind: "invalid-json", detail: "x" },
      ],
      agents: [
        { name: "bare", path: ".claude/agents/bare.md", hasFrontmatter: false },
        { name: "nodesc", path: ".claude/agents/nodesc.md", hasFrontmatter: true },
      ],
      hooks: [
        {
          name: "Nope",
          path: "/tmp/proj/.claude/settings.json",
          event: "Nope",
        },
        {
          name: "PreToolUse",
          path: "/tmp/proj/.claude/settings.json",
          event: "PreToolUse",
          command: "node gone.js",
          scriptPath: "./gone.js",
          scriptExists: false,
        },
      ],
      hasSkillsLock: true,
      lockedSkills: [{ id: "pinned-gone" }],
      skills: [
        withBudget,
        skill({ id: "no-md", hasSkillMd: false, hasFrontmatter: false }),
        skill({ id: "no-fm", hasFrontmatter: false }),
        skill({ id: "no-desc", frontmatterName: "no-desc" }),
        skill({ id: "dup1", frontmatterName: "dup1", description: "twin" }),
        skill({ id: "dup2", frontmatterName: "dup2", description: "twin" }),
        skill({
          id: "dangling",
          frontmatterName: "dangling",
          description: "d",
          brokenReferences: ["references/gone.md"],
        }),
      ],
      mcp: [
        {
          name: "dead",
          path: "/tmp/proj/.mcp.json",
          hasCommand: false,
          hasUrl: false,
          literalEnvKeys: [],
          raw: "{}",
        },
        {
          name: "typeless",
          path: "/tmp/proj/.mcp.json",
          hasCommand: false,
          hasUrl: true,
          literalEnvKeys: [],
          raw: "{}",
        },
        {
          name: "leaky",
          path: "/tmp/proj/.mcp.json",
          hasCommand: true,
          hasUrl: false,
          literalEnvKeys: [],
          raw: '{"env":{"T":"ghp_abcdefghij0123456789abcd"}}',
        },
        {
          name: "literal",
          path: "/tmp/proj/.mcp.json",
          hasCommand: true,
          hasUrl: false,
          literalEnvKeys: ["API_KEY"],
          raw: "{}",
        },
      ],
    });

    const noLock = baseFacts({
      hasSkillsLock: false,
      skills: [skill({ id: "a", frontmatterName: "a", description: "d" })],
    });

    const emitted = new Set([
      ...runChecks(withLock, { skillDescriptionBytes: 16_000 }).map(
        (f) => f.ruleId,
      ),
      ...runChecks(noLock, { requireLock: true }).map((f) => f.ruleId),
    ]);
    const declared = new Set(STRUCTURAL_CHECKS.map((c) => c.id));

    expect([...emitted].sort()).toEqual([...declared].sort());
  });

  test("declared ids are unique", () => {
    const ids = STRUCTURAL_CHECKS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("determinism", () => {
  test("findings are stable and uniquely identified", () => {
    const facts = baseFacts({
      hasSkillsLock: true,
      lockedSkills: [{ id: "gone" }],
      skills: [
        skill({ id: "b-local", frontmatterName: "b-local", description: "d" }),
        skill({ id: "a-local", frontmatterName: "wrong", description: "d" }),
      ],
      mcp: [
        {
          name: "x",
          path: "/tmp/proj/.mcp.json",
          hasCommand: false,
          hasUrl: false,
          literalEnvKeys: [],
          raw: "{}",
        },
      ],
    });
    const first = runChecks(facts);
    const second = runChecks(facts);
    expect(first).toEqual(second);
    expect(new Set(first.map((f) => f.id)).size).toBe(first.length);
    expect(ids(facts).length).toBeGreaterThan(2);
  });
});
