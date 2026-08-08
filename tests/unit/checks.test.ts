import { describe, expect, test } from "bun:test";
import type { Facts, HookFact, McpFact, SkillFact } from "../../src/facts/types";
import { runChecks } from "../../src/checks/index";

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
    expect(f.subject).toBe("config:/tmp/proj/.mcp.json");
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
        hooks: [hook({ name: "PostToolBatch", event: "PostToolBatch" })],
      }),
    );
    expect(findings.map((f) => f.ruleId)).toEqual(["hook.unknown-event"]);
    expect(findings[0]!.severity).toBe("error");
    expect(findings[0]!.subject).toBe("hook:PostToolBatch");
    expect(findings[0]!.message).toContain("PostToolBatch");
  });

  test("one finding per bad event, not per registered command", () => {
    const findings = runChecks(
      baseFacts({
        hooks: [
          hook({ event: "PostToolBatch", command: "node a.js" }),
          hook({ event: "PostToolBatch", command: "node b.js" }),
          hook({ event: "PostToolBatch", command: "node c.js" }),
        ],
      }),
    );
    expect(findings).toHaveLength(1);
  });

  test("every real event name is accepted", () => {
    const events = [
      "PreToolUse",
      "PostToolUse",
      "UserPromptSubmit",
      "Notification",
      "Stop",
      "SubagentStop",
      "PreCompact",
      "SessionStart",
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

  test("frontmatter name mismatching the folder", () => {
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
    expect(findings.map((f) => f.ruleId)).toEqual(["skill.name-mismatch"]);
    expect(findings[0]!.message).toContain("vercel-composition-patterns");
  });

  test("matching name and description produce nothing", () => {
    const findings = runChecks(
      baseFacts({
        skills: [skill({ id: "seo", frontmatterName: "seo", description: "d" })],
      }),
    );
    expect(findings).toEqual([]);
  });

  test("frontmatter present but name/description absent", () => {
    const findings = runChecks(baseFacts({ skills: [skill({ id: "bare" })] }));
    expect(findings.map((f) => f.ruleId).sort()).toEqual([
      "skill.missing-description",
      "skill.missing-name",
    ]);
  });
});

describe("skills-lock integrity", () => {
  test("skill on disk but not in lock is unmanaged", () => {
    const findings = runChecks(
      baseFacts({
        hasSkillsLock: true,
        lockedSkills: [{ id: "seo" }],
        skills: [
          skill({ id: "seo", frontmatterName: "seo", description: "d" }),
          skill({ id: "my-local", frontmatterName: "my-local", description: "d" }),
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
          skill({ id: `s${i}`, frontmatterName: `s${i}`, description: "d" }),
        ),
      }),
      { requireLock: true },
    );
    expect(findings.map((f) => f.ruleId)).toEqual(["skill.no-lockfile"]);
    expect(findings[0]!.message).toContain("5");
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

  test("url-only server is fine", () => {
    const findings = runChecks(
      baseFacts({
        mcp: [mcp({ name: "remote", hasCommand: false, hasUrl: true })],
      }),
    );
    expect(findings).toEqual([]);
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
