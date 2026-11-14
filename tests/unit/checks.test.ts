import { describe, expect, test } from "bun:test";
import type { Facts, HookFact, McpFact, SkillFact } from "../../src/facts/types";
import { runChecks, STRUCTURAL_CHECKS } from "../../src/checks/index";
import { secretLabelOf } from "../../src/discover/mcp";
import { agentFact, hookFact, mcpFact, skillFact } from "../helpers/facts";
import { defaultConfig, type Thresholds } from "../../src/config/schema";

/** Run the listing and budget checks at the defaults, with these overrides. */
const limits = (t: Partial<Thresholds> = {}) => ({ thresholds: { ...defaultConfig.thresholds, ...t } });

function skill(partial: Partial<SkillFact> & Pick<SkillFact, "id">): SkillFact {
  return skillFact({
    path: `.claude/skills/${partial.id}`,
    source: "project",
    hasSkillMd: true,
    hasFrontmatter: true,
    ...partial,
  });
}

function baseFacts(overrides: Partial<Facts> = {}): Facts {
  return {
    root: "/tmp/proj",
    skillLockRoots: ["/tmp/proj"],
    codexProjectDocMaxBytes: 32_768,
    codexInstructionChain: [],
    packageManager: "bun",
    dependencies: {},
    devDependencies: {},
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
  return runChecks(facts, limits()).map((f) => f.ruleId);
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
      }), limits(),
    );
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.ruleId).toBe("config.unreadable");
    expect(f.severity).toBe("error");
    // the kind and detail disambiguate several failures in one file
    expect(f.subject).toStartWith("config:/tmp/proj/.mcp.json#");
    expect(f.message).toContain("not valid JSON");
  });

  test("invalid lockfile does not produce derived lock drift", () => {
    const findings = runChecks(baseFacts({
      skills: [skill({ id: "local" })],
      hasSkillsLock: true,
      skillsLockInvalid: true,
    }), limits());
    expect(findings.map((finding) => finding.ruleId)).not.toContain("skill.not-in-lock");
  });
});

describe("hook checks", () => {
  const hook = (partial: Partial<HookFact>): HookFact => ({
    path: "/tmp/proj/.claude/settings.json",
    event: "PreToolUse",
    sourceProvider: "claude",
    schemaProfile: "claude",
    ...partial,
  });

  test("unknown event name is an error — the hook never fires", () => {
    const findings = runChecks(
      baseFacts({
        hooks: [hook({ event: "PreToolUce" })],
      }), limits(),
    );
    expect(findings.map((f) => f.ruleId)).toEqual(["claude.hook.unknown-event"]);
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
      }), limits(),
    );
    expect(findings).toHaveLength(1);
  });

  test("existing script and unresolvable command produce nothing", () => {
    const findings = runChecks(
      baseFacts({
        hooks: [
          hook({ command: "node ok.js", scriptPath: "ok.js", scriptExists: true }),
          hook({ command: "rtk git status" }),
          hook({}),
        ],
      }), limits(),
    );
    expect(findings).toEqual([]);
  });
});

describe("skill structure checks", () => {
  test("missing SKILL.md", () => {
    const findings = runChecks(
      baseFacts({
        skills: [skill({ id: "grouping-folder", hasSkillMd: false, hasFrontmatter: false })],
      }), limits(),
    );
    expect(findings.map((f) => f.ruleId)).toEqual(["skill.missing-skill-md"]);
    expect(findings[0]!.severity).toBe("warning");
  });

  test("missing frontmatter reported once, not also as missing name", () => {
    const findings = runChecks(
      baseFacts({ skills: [skill({ id: "context7-mcp", hasFrontmatter: false })] }), limits(),
    );
    expect(findings.map((f) => f.ruleId)).toEqual(["claude.skill.missing-frontmatter"]);
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
      }), limits(),
    );
    expect(findings).toEqual([]);
  });

  test("frontmatter with no name at all is not a finding", () => {
    const findings = runChecks(
      baseFacts({ skills: [skill({ id: "s", description: "d" })] }), limits(),
    );
    expect(findings).toEqual([]);
  });

  test("matching name and description produce nothing", () => {
    const findings = runChecks(
      baseFacts({
        skills: [skill({ id: "seo", frontmatterName: "seo", description: "d" })],
      }), limits(),
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
      }), limits(),
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
      }), limits(),
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
      }), limits(),
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
      }), limits(),
    );
    // malformed is malformed wherever it lives
    expect(findings.map((f) => f.ruleId)).toEqual(["claude.skill.missing-frontmatter"]);
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
      { requireLock: true, ...limits() },
    );
    expect(findings.map((f) => f.ruleId)).toEqual(["skill.no-lockfile"]);
    expect(findings[0]!.message).toContain("1 skill ");
  });

  test("no lockfile → no lock findings at all", () => {
    const findings = runChecks(
      baseFacts({
        hasSkillsLock: false,
        skills: [skill({ id: "whatever", frontmatterName: "whatever", description: "d" })],
      }), limits(),
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
      { requireLock: true, ...limits() },
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
      }), limits(),
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
      }), limits(),
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
      }), limits(),
    );
    expect(findings).toEqual([]);
  });
});

describe("agent definitions", () => {
  const agent = (
    name: string,
    extra: { hasFrontmatter?: boolean; description?: string } = {},
  ) =>
    agentFact({
      name,
      path: `.claude/agents/${name}.md`,
      hasFrontmatter: true,
      frontmatterName: name,
      ...extra,
    });

  test("no frontmatter block is an error", () => {
    const findings = runChecks(
      baseFacts({ agents: [agent("reviewer", { hasFrontmatter: false })] }), limits(),
    );
    expect(findings.map((f) => f.ruleId)).toEqual(["claude.agent.missing-frontmatter"]);
    expect(findings[0]!.severity).toBe("error");
    expect(findings[0]!.subject).toBe("agent:reviewer");
  });

  test("frontmatter with no description is an error", () => {
    const findings = runChecks(baseFacts({ agents: [agent("reviewer")] }), limits());
    expect(findings.map((f) => f.ruleId)).toEqual(["claude.agent.missing-description"]);
    expect(findings[0]!.severity).toBe("error");
  });

  test("an off-format name that Claude Code loads is not flagged", () => {
    // The reference names `reviewer-v2` as valid and skips only empty, `-`-led,
    // `:`-bearing or >256-char names. See docs/spec/agents.md.
    const findings = runChecks(
      baseFacts({
        agents: [
          agentFact({
            name: "marketing-seo-specialist",
            path: ".claude/agents/marketing-seo-specialist.md",
            hasFrontmatter: true,
            frontmatterName: "SEO Specialist",
            description: "Optimises pages for search",
          }),
        ],
      }), limits(),
    );
    expect(findings.map((f) => f.ruleId)).toEqual([]);
  });

  test("a complete agent produces nothing", () => {
    expect(
      runChecks(baseFacts({ agents: [agent("reviewer", { description: "Reviews code" })] }), limits()),
    ).toEqual([]);
  });

  test("missing frontmatter is reported once, not also as missing description", () => {
    const findings = runChecks(
      baseFacts({ agents: [agent("x", { hasFrontmatter: false })] }), limits(),
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
          agentFact({
            name: "engineering-api-platform-engineer",
            path: ".claude/agents/engineering-api-platform-engineer.md",
            hasFrontmatter: true,
            frontmatterName: "api-platform-engineer",
            description: "Designs API platforms",
          }),
        ],
      }), limits(),
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
      }), limits(),
    );
    expect(findings.map((f) => f.ruleId)).toEqual(["skill.duplicate-description"]);
    expect(findings[0]!.subject).toBe("skills:firebase-basics firebase-firestore");
    expect(findings[0]!.severity).toBe("info");
    expect(findings[0]!.message).toContain("firebase-basics");
    expect(findings[0]!.message).toContain("firebase-firestore");
  });

  test("three sharing one description stay one finding", () => {
    const findings = runChecks(
      baseFacts({ skills: [desc("a", "same"), desc("b", "same"), desc("c", "same")] }), limits(),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.subject).toBe("skills:a b c");
  });

  test("sibling projects in a monorepo are not one namespace", () => {
    // Nested discovery flattens every `.claude/skills` under the scan root.
    // These two never load in the same session, so the choice between them is
    // never made — 29 such warnings fired on one real monorepo.
    const findings = runChecks(
      baseFacts({
        skills: [
          skill({
            id: "accessibility",
            path: "app-a/.claude/skills/accessibility",
            description: "Audit accessibility",
          }),
          skill({
            id: "accessibility",
            path: "app-b/.claude/skills/accessibility",
            description: "Audit accessibility",
          }),
        ],
      }), limits(),
    );
    expect(findings.filter((f) => f.ruleId === "skill.duplicate-description")).toEqual([]);
  });

  test("two under one skills directory still collide", () => {
    const findings = runChecks(
      baseFacts({
        skills: [
          skill({ id: "a11y-one", path: "app-a/.claude/skills/a11y-one", description: "Audit accessibility" }),
          skill({ id: "a11y-two", path: "app-a/.claude/skills/a11y-two", description: "Audit accessibility" }),
        ],
      }), limits(),
    );
    expect(findings.map((f) => f.ruleId)).toEqual(["skill.duplicate-description"]);
  });

  test("whitespace and case differences still collide", () => {
    const findings = runChecks(
      baseFacts({ skills: [desc("a", "  Deploy   the App "), desc("b", "deploy the app")] }), limits(),
    );
    expect(findings).toHaveLength(1);
  });

  test("different descriptions produce nothing", () => {
    expect(
      runChecks(baseFacts({ skills: [desc("a", "one"), desc("b", "two")] }), limits()),
    ).toEqual([]);
  });

  test("same description across .agents and .claude is not a collision", () => {
    const findings = runChecks(baseFacts({
      skills: [
        { ...desc("agents-skill", "same"), path: ".agents/skills/agents-skill" },
        { ...desc("claude-skill", "same"), path: ".claude/skills/claude-skill" },
      ],
    }), limits());
    expect(findings).toEqual([]);
  });

  test("agent-skills skills emit portable structure checks", () => {
    const findings = runChecks(baseFacts({
      skills: [skill({
        id: "pointer",
        path: ".agents/skills/pointer",
        sourceProvider: "agent-skills",
        hasFrontmatter: false,
        brokenReferences: ["references/missing.md"],
      })],
    }), limits());
    expect(findings.map((f) => f.ruleId)).toEqual([
      "agent-skills.skill.missing-frontmatter",
    ]);
  });

  test("agent-skills broken references fire when SKILL.md parses", () => {
    const findings = runChecks(baseFacts({
      skills: [skill({
        id: "pointer",
        path: ".agents/skills/pointer",
        sourceProvider: "agent-skills",
        frontmatterName: "pointer",
        description: "Points at a missing file.",
        brokenReferences: ["references/missing.md"],
      })],
    }), limits());
    expect(findings.map((f) => f.ruleId)).toEqual(["skill.broken-reference"]);
  });

  test("agent-skills requires name matching the directory", () => {
    const findings = runChecks(baseFacts({
      skills: [skill({
        id: "pdf",
        path: ".agents/skills/pdf",
        sourceProvider: "agent-skills",
        frontmatterName: "PDF-Processing",
        description: "Extract text from PDFs.",
      })],
    }), limits());
    expect(findings.map((f) => f.ruleId).sort()).toEqual([
      "agent-skills.skill.invalid-name",
      "agent-skills.skill.name-does-not-match-directory",
    ]);
  });

  test("a skill with no description is left to claude.skill.missing-description", () => {
    const findings = runChecks(
      baseFacts({ skills: [skill({ id: "a", frontmatterName: "a" }), skill({ id: "b", frontmatterName: "b" })] }), limits(),
    );
    expect(findings.map((f) => f.ruleId).sort()).toEqual([
      "claude.skill.missing-description",
      "claude.skill.missing-description",
    ]);
  });

  test("two separate colliding pairs are two findings, in a stable order", () => {
    const findings = runChecks(
      baseFacts({
        skills: [desc("z1", "beta"), desc("a1", "alpha"), desc("a2", "alpha"), desc("z2", "beta")],
      }), limits(),
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
    expect(runChecks(baseFacts({ skills: [g("a"), g("b")] }), limits())).toEqual([]);
  });
});

describe("skill description budget", () => {
  const withDesc = (id: string, len: number) =>
    skill({ id, description: "x".repeat(len), frontmatterName: id });

  test("under the ceiling produces nothing", () => {
    const findings = runChecks(
      baseFacts({ skills: [withDesc("a", 100)] }),
      limits({ skillListingChars: 1000 }),
    );
    expect(findings).toEqual([]);
  });

  test("over the ceiling is one info finding naming the totals", () => {
    const findings = runChecks(
      baseFacts({ skills: [withDesc("a", 600), withDesc("b", 601)] }),
      limits({ skillListingChars: 1000 }),
    );
    expect(findings.map((f) => f.ruleId)).toEqual(["skill.description-budget"]);
    expect(findings[0]!.severity).toBe("info");
    expect(findings[0]!.message).toContain("2 skills");
  });

  test("each skills directory gets its own budget", () => {
    // 600 + 601 bytes summed would clear a 1000 ceiling, but no session loads
    // both directories, so neither one is over.
    const split = runChecks(
      baseFacts({
        skills: [
          skill({ id: "a", path: "app-a/.claude/skills/a", description: "x".repeat(600) }),
          skill({ id: "b", path: "app-b/.claude/skills/b", description: "x".repeat(601) }),
        ],
      }),
      limits({ skillListingChars: 1000 }),
    );
    expect(split).toEqual([]);
  });

  test("one over-budget directory names itself", () => {
    const findings = runChecks(
      baseFacts({
        skills: [
          skill({ id: "a", path: "app-a/.claude/skills/a", description: "x".repeat(600) }),
          skill({ id: "b", path: "app-a/.claude/skills/b", description: "x".repeat(601) }),
          skill({ id: "c", path: "app-b/.claude/skills/c", description: "x".repeat(10) }),
        ],
      }),
      limits({ skillListingChars: 1000 }),
    );
    expect(findings.map((f) => f.ruleId)).toEqual(["skill.description-budget"]);
    expect(findings[0]!.subject).toBe(
      "skills:description-budget:app-a/.claude/skills",
    );
    expect(findings[0]!.message).toContain("app-a/.claude/skills");
  });

  test("global skills do not count against the project budget", () => {
    const g = {
      ...withDesc("g", 5000),
      source: "global" as const,
      path: "/home/u/.claude/skills/g",
    };
    expect(
      runChecks(baseFacts({ skills: [g] }), limits({ skillListingChars: 1000 })),
    ).toEqual([]);
  });

  test("no ceiling configured means no check", () => {
    expect(
      runChecks(baseFacts({ skills: [withDesc("a", 99_999)] }), limits()),
    ).toEqual([]);
  });
});

describe("review regressions", () => {
  test("the same guard under two matchers is one finding", () => {
    const h = (matcher: string) => hookFact({
      path: `/p/.claude/settings.json#${matcher}`,
      event: "PreToolUse",
      command: "./scripts/guard.sh",
      scriptPath: "./scripts/guard.sh",
      scriptExists: false,
    });
    expect(runChecks(baseFacts({ hooks: [h("Bash"), h("Write")] }), limits())).toHaveLength(1);
  });

  test("one MCP name in two files gives two distinct ids", () => {
    const s = (path: string) => mcpFact({
      name: "db",
      path,
      hasCommand: false,
      hasUrl: false,
      literalEnvKeys: [] as string[],
    });
    const f = runChecks(baseFacts({ mcp: [s("/p/.mcp.json"), s("/p/mcp.json")] }), limits());
    expect(f).toHaveLength(2);
    expect(new Set(f.map((x) => x.id)).size).toBe(2);
  });

  test("a hyphenated package slug is not a leaked credential", () => {
    expect(
      runChecks(
        baseFacts({
          mcp: [
            mcpFact({
              name: "tk",
              path: "/p/.mcp.json",
              hasCommand: true,
              hasUrl: false,
              literalEnvKeys: [],
              secretLabel: secretLabelOf('{"args":["--from","git+https://github.com/acme/sk-mcp-server-toolkit"]}'),
            }),
          ],
        }), limits(),
      ),
    ).toEqual([]);
  });

  test("a real OpenAI-shaped key still fires and is never echoed", () => {
    const f = runChecks(
      baseFacts({
        mcp: [
          mcpFact({
            name: "ai",
            path: "/p/.mcp.json",
            hasCommand: true,
            hasUrl: false,
            literalEnvKeys: [],
            secretLabel: secretLabelOf('{"env":{"K":"sk-proj0123456789abcdefghij"}}'),
          }),
        ],
      }), limits(),
    );
    expect(f.map((x) => x.ruleId)).toEqual(["security.hardcoded-secret"]);
    expect(JSON.stringify(f)).not.toContain("proj0123456789");
  });

  test("skill ids containing + do not collide", () => {
    const d = (id: string, description: string) =>
      skill({ id, frontmatterName: id, description });
    const f = runChecks(
      baseFacts({
        skills: [d("a+b", "Alpha"), d("c", "Alpha"), d("a", "Beta"), d("b+c", "Beta")],
      }), limits(),
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
      limits({ skillListingChars: 40 }),
    );
    expect(f.map((x) => x.ruleId)).toEqual(["skill.missing-skill-md"]);
  });

  test("a 20000-character description is capped at 1536 and does not trip the 8000 fallback", () => {
    const findings = runChecks(
      baseFacts({
        skills: [skill({ id: "s", frontmatterName: "s", description: "x".repeat(20_000) })],
      }),
      limits(),
    );
    expect(findings.map((f) => f.ruleId)).not.toContain("skill.description-budget");
  });

  test("the listing budget is characters, not a 16000-byte ceiling", () => {
    const skills = Array.from({ length: 6 }, (_, i) =>
      skill({
        id: `s${i}`,
        frontmatterName: `s${i}`,
        description: `${String(i).padStart(2, "0")}${"x".repeat(1_534)}`,
      }),
    );
    const findings = runChecks(baseFacts({ skills }), limits());
    expect(findings.map((f) => f.ruleId)).toEqual(["skill.description-budget"]);
    expect(findings[0]!.message).toContain("per-entry cap 1536");
  });

  test("the listing budget counts characters, including non-ASCII", () => {
    const over = runChecks(
      baseFacts({
        skills: [skill({ id: "s", frontmatterName: "s", description: "é".repeat(30) })],
      }),
      limits({ skillListingChars: 20 }),
    );
    expect(over.map((x) => x.ruleId)).toEqual(["skill.description-budget"]);
    const under = runChecks(
      baseFacts({
        skills: [skill({ id: "s", frontmatterName: "s", description: "é".repeat(30) })],
      }),
      limits({ skillListingChars: 40 }),
    );
    expect(under.map((x) => x.ruleId)).toEqual([]);
  });
});

describe("mcp checks", () => {
  const mcp = (partial: Partial<McpFact> & Pick<McpFact, "name">): McpFact =>
    mcpFact({
      path: "/tmp/proj/.mcp.json",
      hasCommand: true,
      hasUrl: false,
      literalEnvKeys: [],
      ...partial,
    });

  test("server with neither command nor url is unlaunchable by schema", () => {
    const findings = runChecks(
      baseFacts({ mcp: [mcp({ name: "broken", hasCommand: false })] }), limits(),
    );
    expect(findings.map((f) => f.ruleId)).toEqual(["claude.mcp.no-launch"]);
    expect(findings[0]!.severity).toBe("error");
    expect(findings[0]!.reason).toContain("schema");
  });

  test("path-like command that is missing on disk is an error", () => {
    const findings = runChecks(
      baseFacts({
        mcp: [
          mcp({
            name: "local",
            command: "./bin/missing-server",
            commandExists: false,
          }),
        ],
      }), limits(),
    );
    expect(findings.map((f) => f.ruleId)).toEqual(["mcp.command-missing"]);
    expect(findings[0]!.severity).toBe("error");
    expect(findings[0]!.message).toContain("./bin/missing-server");
  });

  test("bare PATH binaries are not claimed missing", () => {
    const findings = runChecks(
      baseFacts({
        mcp: [
          mcp({
            name: "npx-server",
            command: "npx",
            // discovery leaves commandExists unset for bare names
          }),
        ],
      }), limits(),
    );
    expect(findings.map((f) => f.ruleId)).not.toContain("mcp.command-missing");
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
      }), limits(),
    );
    expect(findings).toEqual([]);
  });

  test("a url with no transport type is an error — Claude Code skips it", () => {
    const findings = runChecks(
      baseFacts({
        mcp: [mcp({ name: "remote", hasCommand: false, hasUrl: true })],
      }), limits(),
    );
    expect(findings.map((f) => f.ruleId)).toEqual(["claude.mcp.url-without-type"]);
    expect(findings[0]!.severity).toBe("error");
  });

  test("token-shaped literal in config is an error", () => {
    const findings = runChecks(
      baseFacts({
        mcp: [
          mcp({
            name: "gh",
            secretLabel: secretLabelOf('{"env":{"GITHUB_TOKEN":"ghp_abcdefghij0123456789abcd"}}'),
          }),
        ],
      }), limits(),
    );
    expect(findings.map((f) => f.ruleId)).toEqual(["security.hardcoded-secret"]);
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
            secretLabel: secretLabelOf('{"env":{"K":"sk-ant-api03-ABCDEFGHIJKLMNOP"}}'),
          }),
        ],
      }), limits(),
    );
    expect(findings[0]!.ruleId).toBe("security.hardcoded-secret");
    // rotating at the wrong provider is the worst failure for this finding
    expect(findings[0]!.message).toContain("Anthropic");
    expect(findings[0]!.message).not.toContain("OpenAI");
    expect(JSON.stringify(findings[0])).not.toContain("ABCDEFGHIJKLMNOP");
  });

  test("literal env value flagged as possible secret", () => {
    const findings = runChecks(
      baseFacts({
        mcp: [mcp({ name: "svc", literalEnvKeys: ["API_KEY"] })],
      }), limits(),
    );
    expect(findings.map((f) => f.ruleId)).toEqual(["mcp.literal-env"]);
    expect(findings[0]!.message).toContain("API_KEY");
  });

  test("literal headers or auth fields are a warning and never echo values", () => {
    const findings = runChecks(
      baseFacts({
        mcp: [
          mcp({
            name: "remote",
            hasCommand: false,
            hasUrl: true,
            schemaProfile: "cursor-json",
            literalCredentialFields: ["auth.CLIENT_SECRET", "headers.Authorization"],
            secretLabel: secretLabelOf('{"auth":{"CLIENT_SECRET":"oauth-client-secret-value"}}'),
          }),
        ],
      }), limits(),
    );
    expect(findings.map((f) => f.ruleId)).toEqual(["mcp.literal-credential"]);
    expect(findings[0]!.severity).toBe("warning");
    expect(findings[0]!.message).toContain("auth.CLIENT_SECRET");
    expect(findings[0]!.message).toContain("headers.Authorization");
    expect(findings[0]!.message).not.toContain("oauth-client-secret-value");
    expect(JSON.stringify(findings[0]!)).not.toContain("oauth-client-secret-value");
  });

  test("${VAR} indirection produces nothing", () => {
    const findings = runChecks(
      baseFacts({
        mcp: [mcp({ name: "svc", secretLabel: secretLabelOf('{"env":{"API_KEY":"${API_KEY}"}}') })],
      }), limits(),
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
        {
          path: "/tmp/proj/.claude/skills/big/SKILL.md",
          kind: "truncated",
          detail: "file exceeds 65536 byte scan cap",
        },
      ],
      agents: [
        agentFact({ name: "bare", path: ".claude/agents/bare.md", hasFrontmatter: false }),
        agentFact({ name: "nodesc", path: ".claude/agents/nodesc.md", hasFrontmatter: true }),
        agentFact({ name: "dup-a", path: ".claude/agents/dup-a.md", hasFrontmatter: true, frontmatterName: "duplicate", description: "d" }),
        agentFact({ name: "dup-b", path: ".claude/agents/dup-b.md", hasFrontmatter: true, frontmatterName: "duplicate", description: "d" }),
        agentFact({ name: "bad", path: ".claude/agents/bad.md", hasFrontmatter: true, frontmatterName: "plug:bad", description: "d" }),
        {
          name: "explore",
          path: ".commandcode/agents/explore.md",
          sourceProvider: "commandcode",
          schemaProfile: "commandcode-md",
          hasFrontmatter: true,
          commandcodeDefects: ["reserved-name"],
        },
        {
          name: "researcher",
          path: ".commandcode/agents/researcher.md",
          sourceProvider: "commandcode",
          schemaProfile: "commandcode-md",
          hasFrontmatter: true,
          permissionMode: "yolo",
          commandcodeDefects: ["invalid-permission-mode"],
        },
        {
          name: "typed",
          path: ".commandcode/agents/typed.md",
          sourceProvider: "commandcode",
          schemaProfile: "commandcode-md",
          hasFrontmatter: true,
          invalidField: "background",
          commandcodeDefects: ["invalid-field-type"],
        },
        {
          name: "reviewer",
          path: ".codex/agents/reviewer.toml",
          sourceProvider: "codex",
          hasFrontmatter: false,
          codexMissingFields: ["developer_instructions"],
        },
      ],
      hooks: [
        hookFact({
          path: "/tmp/proj/.claude/settings.json",
          event: "Nope",
        }),
        hookFact({
          path: "/tmp/proj/.claude/settings.json",
          event: "PreToolUse",
          command: "node gone.js",
          scriptPath: "./gone.js",
          scriptExists: false,
        }),
        hookFact({
          path: "/tmp/proj/.github/hooks/x.json",
          event: "NotVscode",
          source: "vscode-hooks",
          sourceProvider: "vscode",
          schemaProfile: "vscode-native",
        }),
        hookFact({
          path: "/tmp/proj/.github/hooks/x.json",
          event: "PreToolUse",
          source: "vscode-hooks",
          sourceProvider: "vscode",
          schemaProfile: "vscode-native",
          handlerType: "command",
          command: "node gone.js",
          scriptPath: "./gone.js",
          scriptExists: false,
        }),
        hookFact({
          path: "/tmp/proj/.claude/settings.json",
          event: "PreToolUse",
          defect: "invalid-group",
        }),
        hookFact({
          path: "/tmp/proj/.claude/settings.json",
          event: "PreToolUse",
          handlerType: "command",
          defect: "command-without-command",
        }),
        hookFact({
          path: "/tmp/proj/.claude/settings.json",
          event: "PreToolUse",
          handlerType: "http",
          defect: "http-without-url",
        }),
        hookFact({
          path: "/tmp/proj/.claude/settings.json",
          event: "PreToolUse",
          handlerType: "mcp_tool",
          defect: "mcp-tool-without-server-or-tool",
        }),
        hookFact({
          path: "/tmp/proj/.claude/settings.json",
          event: "PreToolUse",
          handlerType: "prompt",
          defect: "prompt-without-prompt",
        }),
        hookFact({
          path: "/tmp/proj/.claude/settings.json",
          event: "SessionStart",
          handlerType: "http",
          defect: "incompatible-handler",
        }),
        hookFact({
          path: "/tmp/proj/.claude/settings.json",
          event: "PreToolUse",
          defect: "unknown-handler-type",
          unknownHandlerType: "widget",
        }),
        hookFact({
          path: "/tmp/proj/.github/hooks/x.json",
          event: "PreToolUse",
          source: "vscode-hooks",
          sourceProvider: "vscode",
          schemaProfile: "vscode-native",
          defect: "invalid-group",
        }),
        {
          path: "/tmp/proj/.github/hooks/x.json",
          event: "PreToolUse",
          source: "vscode-hooks",
          sourceProvider: "vscode",
          schemaProfile: "vscode-native",
          handlerType: "command",
          defect: "command-without-command",
        },
        {
          path: "/tmp/proj/.github/hooks/x.json",
          event: "PreToolUse",
          source: "vscode-hooks",
          sourceProvider: "vscode",
          schemaProfile: "vscode-native",
          defect: "unknown-handler-type",
          unknownHandlerType: "widget",
        },
        {
          path: "/tmp/proj/.github/hooks/copilot.json",
          event: "notAnEvent",
          source: "vscode-hooks",
          sourceProvider: "vscode",
          schemaProfile: "copilot-cli",
        },
        {
          path: "/tmp/proj/.github/hooks/copilot.json",
          event: "sessionStart",
          source: "vscode-hooks",
          sourceProvider: "vscode",
          schemaProfile: "copilot-cli",
          handlerType: "command",
          command: "node gone.js",
          scriptPath: "./gone-copilot.js",
          scriptExists: false,
        },
        {
          path: "/tmp/proj/.github/hooks/copilot.json",
          event: "sessionStart",
          source: "vscode-hooks",
          sourceProvider: "vscode",
          schemaProfile: "copilot-cli",
          handlerType: "command",
          defect: "command-without-command",
        },
        {
          path: "/tmp/proj/.github/hooks/copilot.json",
          event: "sessionStart",
          source: "vscode-hooks",
          sourceProvider: "vscode",
          schemaProfile: "copilot-cli",
          handlerType: "http",
          defect: "http-without-url",
        },
        {
          path: "/tmp/proj/.github/hooks/copilot.json",
          event: "sessionStart",
          source: "vscode-hooks",
          sourceProvider: "vscode",
          schemaProfile: "copilot-cli",
          handlerType: "prompt",
          defect: "prompt-without-prompt",
        },
        {
          path: "/tmp/proj/.github/hooks/copilot.json",
          event: "sessionStart",
          source: "vscode-hooks",
          sourceProvider: "vscode",
          schemaProfile: "copilot-cli",
          defect: "unknown-handler-type",
          unknownHandlerType: "widget",
        },
        {
          path: "/tmp/proj/.github/hooks/copilot.json",
          event: "preToolUse",
          source: "vscode-hooks",
          sourceProvider: "vscode",
          schemaProfile: "copilot-cli",
          handlerType: "prompt",
          defect: "incompatible-handler",
        },
        hookFact({
          path: "/tmp/proj/.commandcode/settings.json",
          event: "NopeCc",
          sourceProvider: "commandcode",
          schemaProfile: "commandcode",
        }),
        hookFact({
          path: "/tmp/proj/.commandcode/settings.json",
          event: "PreToolUse",
          sourceProvider: "commandcode",
          schemaProfile: "commandcode",
          handlerType: "command",
          command: "node gone.js",
          scriptPath: "./gone-cc.js",
          scriptExists: false,
        }),
        hookFact({
          path: "/tmp/proj/.commandcode/settings.json",
          event: "PreToolUse",
          sourceProvider: "commandcode",
          schemaProfile: "commandcode",
          defect: "invalid-group",
        }),
        hookFact({
          path: "/tmp/proj/.commandcode/settings.json",
          event: "PreToolUse",
          sourceProvider: "commandcode",
          schemaProfile: "commandcode",
          handlerType: "command",
          defect: "command-without-command",
        }),
        hookFact({
          path: "/tmp/proj/.commandcode/settings.json",
          event: "PreToolUse",
          sourceProvider: "commandcode",
          schemaProfile: "commandcode",
          defect: "unknown-handler-type",
          unknownHandlerType: "http",
        }),
        hookFact({
          path: "/tmp/proj/.commandcode/settings.json",
          event: "Stop",
          sourceProvider: "commandcode",
          schemaProfile: "commandcode",
          handlerType: "command",
          command: "true",
          timeout: 601,
          timeoutOutOfBounds: true,
        }),
        {
          path: "/tmp/proj/.grok/hooks/x.json",
          event: "NopeGrok",
          source: "grok-hooks",
          sourceProvider: "grok",
          schemaProfile: "grok",
        },
        {
          path: "/tmp/proj/.grok/hooks/x.json",
          event: "PreToolUse",
          source: "grok-hooks",
          sourceProvider: "grok",
          schemaProfile: "grok",
          handlerType: "command",
          command: "node gone.js",
          scriptPath: "./gone-grok.js",
          scriptExists: false,
        },
        {
          path: "/tmp/proj/.grok/hooks/x.json",
          event: "PreToolUse",
          source: "grok-hooks",
          sourceProvider: "grok",
          schemaProfile: "grok",
          defect: "invalid-group",
        },
        {
          path: "/tmp/proj/.grok/hooks/x.json",
          event: "PreToolUse",
          source: "grok-hooks",
          sourceProvider: "grok",
          schemaProfile: "grok",
          handlerType: "command",
          defect: "command-without-command",
        },
        {
          path: "/tmp/proj/.grok/hooks/x.json",
          event: "Notification",
          source: "grok-hooks",
          sourceProvider: "grok",
          schemaProfile: "grok",
          handlerType: "http",
          defect: "http-without-url",
        },
        {
          path: "/tmp/proj/.grok/hooks/x.json",
          event: "PreToolUse",
          source: "grok-hooks",
          sourceProvider: "grok",
          schemaProfile: "grok",
          defect: "unknown-handler-type",
          unknownHandlerType: "mcp_tool",
        },
        {
          path: "/tmp/proj/.windsurf/hooks.json",
          event: "nope",
          source: "windsurf-hooks",
          sourceProvider: "windsurf",
          schemaProfile: "windsurf",
        },
        {
          path: "/tmp/proj/.windsurf/hooks.json",
          event: "pre_read_code",
          source: "windsurf-hooks",
          sourceProvider: "windsurf",
          schemaProfile: "windsurf",
          handlerType: "command",
          command: "bin/gone.sh",
          scriptPath: "bin/gone.sh",
          scriptExists: false,
        },
        {
          path: "/tmp/proj/.windsurf/hooks.json",
          event: "pre_write_code",
          source: "windsurf-hooks",
          sourceProvider: "windsurf",
          schemaProfile: "windsurf",
          handlerType: "command",
          defect: "command-without-command",
        },
        {
          path: "/tmp/proj/.gemini/settings.json",
          event: "PreToolUse",
          source: "gemini-settings",
          sourceProvider: "gemini",
          schemaProfile: "gemini",
        },
        {
          path: "/tmp/proj/.gemini/settings.json",
          event: "BeforeTool",
          source: "gemini-settings",
          sourceProvider: "gemini",
          schemaProfile: "gemini",
          handlerType: "command",
          command: "bin/gone.sh",
          scriptPath: "bin/gone.sh",
          scriptExists: false,
        },
        {
          path: "/tmp/proj/.gemini/settings.json",
          event: "AfterTool",
          source: "gemini-settings",
          sourceProvider: "gemini",
          schemaProfile: "gemini",
          defect: "invalid-group",
        },
        {
          path: "/tmp/proj/.gemini/settings.json",
          event: "BeforeAgent",
          source: "gemini-settings",
          sourceProvider: "gemini",
          schemaProfile: "gemini",
          handlerType: "command",
          defect: "command-without-command",
        },
        {
          path: "/tmp/proj/.gemini/settings.json",
          event: "AfterAgent",
          source: "gemini-settings",
          sourceProvider: "gemini",
          schemaProfile: "gemini",
          defect: "unknown-handler-type",
          unknownHandlerType: "http",
        },
        {
          path: "/tmp/proj/.cursor/hooks.json",
          event: "PreToolUse",
          source: "cursor-hooks",
          sourceProvider: "cursor",
          schemaProfile: "cursor",
        },
        {
          path: "/tmp/proj/.cursor/hooks.json",
          event: "preToolUse",
          source: "cursor-hooks",
          sourceProvider: "cursor",
          schemaProfile: "cursor",
          handlerType: "command",
          command: "bin/gone.sh",
          scriptPath: "bin/gone.sh",
          scriptExists: false,
        },
        {
          path: "/tmp/proj/.cursor/hooks.json",
          event: "postToolUse",
          source: "cursor-hooks",
          sourceProvider: "cursor",
          schemaProfile: "cursor",
          handlerType: "command",
          defect: "command-without-command",
        },
        {
          path: "/tmp/proj/.cursor/hooks.json",
          event: "afterFileEdit",
          source: "cursor-hooks",
          sourceProvider: "cursor",
          schemaProfile: "cursor",
          defect: "unknown-handler-type",
          unknownHandlerType: "http",
        },
        {
          path: "/tmp/proj/.kiro/hooks/bad.json",
          event: "NotAKiroEvent",
          source: "kiro-hooks",
          sourceProvider: "kiro",
          schemaProfile: "kiro",
        },
        {
          path: "/tmp/proj/.kiro/hooks/guard.json",
          event: "PreToolUse",
          source: "kiro-hooks",
          sourceProvider: "kiro",
          schemaProfile: "kiro",
          handlerType: "command",
          command: ".kiro/hooks/gone.sh",
          scriptPath: ".kiro/hooks/gone.sh",
          scriptExists: false,
        },
        {
          path: "/tmp/proj/.kiro/hooks/no-cmd.json",
          event: "Stop",
          source: "kiro-hooks",
          sourceProvider: "kiro",
          schemaProfile: "kiro",
          handlerType: "command",
          defect: "command-without-command",
        },
        {
          path: "/tmp/proj/.kiro/hooks/no-prompt.json",
          event: "SessionStart",
          source: "kiro-hooks",
          sourceProvider: "kiro",
          schemaProfile: "kiro",
          handlerType: "agent",
          defect: "prompt-without-prompt",
        },
        {
          path: "/tmp/proj/.kiro/hooks/bad-type.json",
          event: "PostFileSave",
          source: "kiro-hooks",
          sourceProvider: "kiro",
          schemaProfile: "kiro",
          defect: "unknown-handler-type",
          unknownHandlerType: "http",
        },
        {
          path: "/tmp/proj/.kiro/hooks/no-version.json",
          event: "(file)",
          source: "kiro-hooks",
          sourceProvider: "kiro",
          schemaProfile: "kiro",
          defect: "invalid-group",
          defectDetail: "missing-version",
        },
        ...(["NopeQwen", "PreToolUse"] as const).map((event) =>
          hookFact({
            path: "/tmp/proj/.qwen/settings.json",
            event,
            source: "qwen-settings",
            sourceProvider: "qwen",
            schemaProfile: "qwen",
            ...(event === "PreToolUse"
              ? { handlerType: "command" as const, command: "node gone.js", scriptPath: "./gone-qwen.js", scriptExists: false }
              : {}),
          }),
        ),
        ...(["command-without-command", "http-without-url", "unknown-handler-type"] as const).map((defect) =>
          hookFact({
            path: "/tmp/proj/.qwen/settings.json",
            event: "Stop",
            source: "qwen-settings",
            sourceProvider: "qwen",
            schemaProfile: "qwen",
            defect,
            ...(defect === "unknown-handler-type" ? { unknownHandlerType: "widget" } : {}),
          }),
        ),
        hookFact({
          path: "/tmp/proj/.devin/hooks.v1.json",
          event: "NopeDevin",
          source: "devin-hooks",
          sourceProvider: "devin",
          schemaProfile: "devin",
        }),
        hookFact({
          path: "/tmp/proj/.devin/hooks.v1.json",
          event: "PreToolUse",
          source: "devin-hooks",
          sourceProvider: "devin",
          schemaProfile: "devin",
          handlerType: "command",
          command: "node gone.js",
          scriptPath: "./gone-devin.js",
          scriptExists: false,
        }),
        hookFact({
          path: "/tmp/proj/.devin/hooks.v1.json",
          event: "PreToolUse",
          source: "devin-hooks",
          sourceProvider: "devin",
          schemaProfile: "devin",
          defect: "invalid-group",
        }),
        hookFact({
          path: "/tmp/proj/.devin/hooks.v1.json",
          event: "PostToolUse",
          source: "devin-hooks",
          sourceProvider: "devin",
          schemaProfile: "devin",
          handlerType: "command",
          defect: "command-without-command",
        }),
        hookFact({
          path: "/tmp/proj/.devin/hooks.v1.json",
          event: "Stop",
          source: "devin-hooks",
          sourceProvider: "devin",
          schemaProfile: "devin",
          handlerType: "prompt",
          defect: "prompt-without-prompt",
        }),
        hookFact({
          path: "/tmp/proj/.devin/hooks.v1.json",
          event: "SessionStart",
          source: "devin-hooks",
          sourceProvider: "devin",
          schemaProfile: "devin",
          defect: "unknown-handler-type",
          unknownHandlerType: "http",
        }),
        hookFact({
          path: "/tmp/proj/.codex/hooks.json",
          event: "NopeCodex",
          source: "codex-hooks",
          sourceProvider: "codex",
          schemaProfile: "codex",
        }),
        hookFact({
          path: "/tmp/proj/.codex/hooks.json",
          event: "PreToolUse",
          source: "codex-hooks",
          sourceProvider: "codex",
          schemaProfile: "codex",
          handlerType: "command",
          command: "node gone.js",
          scriptPath: "./gone-codex.js",
          scriptExists: false,
        }),
        hookFact({
          path: "/tmp/proj/.codex/hooks.json",
          event: "PreToolUse",
          source: "codex-hooks",
          sourceProvider: "codex",
          schemaProfile: "codex",
          defect: "invalid-group",
        }),
        hookFact({
          path: "/tmp/proj/.codex/hooks.json",
          event: "PostToolUse",
          source: "codex-hooks",
          sourceProvider: "codex",
          schemaProfile: "codex",
          handlerType: "command",
          defect: "command-without-command",
        }),
        hookFact({
          path: "/tmp/proj/.codex/hooks.json",
          event: "PostToolUse",
          source: "codex-hooks",
          sourceProvider: "codex",
          schemaProfile: "codex",
          handlerType: "mcp_tool",
          defect: "mcp-tool-without-server-or-tool",
        }),
        hookFact({
          path: "/tmp/proj/.codex/hooks.json",
          event: "Stop",
          source: "codex-hooks",
          sourceProvider: "codex",
          schemaProfile: "codex",
          defect: "unknown-handler-type",
          unknownHandlerType: "http",
        }),
        hookFact({
          path: "/tmp/proj/.codex/hooks.json",
          event: "Stop",
          source: "codex-hooks",
          sourceProvider: "codex",
          schemaProfile: "codex",
          handlerType: "prompt",
          defect: "incompatible-handler",
        }),
        hookFact({
          path: "/tmp/proj/.codex/config.toml",
          event: "SessionEnd",
          source: "codex-hooks",
          sourceProvider: "codex",
          schemaProfile: "codex",
          handlerType: "command",
          command: "echo end",
          timeout: 0,
          timeoutOutOfBounds: true,
        }),
        hookFact({
          path: "/tmp/proj/.agents/hooks.json",
          event: "NopeAntigravity",
          source: "antigravity-hooks",
          sourceProvider: "antigravity",
          schemaProfile: "antigravity",
        }),
        hookFact({
          path: "/tmp/proj/.agents/hooks.json",
          event: "PreToolUse",
          source: "antigravity-hooks",
          sourceProvider: "antigravity",
          schemaProfile: "antigravity",
          handlerType: "command",
          command: "node gone.js",
          scriptPath: "./gone-antigravity.js",
          scriptExists: false,
        }),
        hookFact({
          path: "/tmp/proj/.agents/hooks.json",
          event: "PostToolUse",
          source: "antigravity-hooks",
          sourceProvider: "antigravity",
          schemaProfile: "antigravity",
          defect: "invalid-group",
        }),
        hookFact({
          path: "/tmp/proj/.agents/hooks.json",
          event: "Stop",
          source: "antigravity-hooks",
          sourceProvider: "antigravity",
          schemaProfile: "antigravity",
          handlerType: "command",
          defect: "command-without-command",
        }),
        hookFact({
          path: "/tmp/proj/.agents/hooks.json",
          event: "SessionStart",
          source: "antigravity-hooks",
          sourceProvider: "antigravity",
          schemaProfile: "antigravity",
          defect: "unknown-handler-type",
          unknownHandlerType: "prompt",
        }),
      ],
      rules: [
        {
          path: "/tmp/proj/.cursor/rules/big.mdc",
          sourceProvider: "cursor",
          lineCount: 501,
          byteLength: 12_000,
          charCount: 12_000,
        },
        {
          path: "/tmp/proj/.devin/rules/big.md",
          sourceProvider: "windsurf",
          lineCount: 10,
          byteLength: 12_001,
          charCount: 12_001,
          windsurfScope: "workspace",
          windsurfTrigger: "yes",
        },
        {
          path: "/home/user/.codeium/windsurf/memories/global_rules.md",
          sourceProvider: "windsurf",
          lineCount: 10,
          byteLength: 6_001,
          charCount: 6_001,
          windsurfScope: "global",
        },
        {
          path: "/tmp/proj/.devin/rules/plain.md",
          sourceProvider: "windsurf",
          lineCount: 5,
          byteLength: 100,
          charCount: 100,
          windsurfScope: "workspace",
          windsurfTrigger: "no",
        },
        {
          path: "/tmp/proj/.agents/rules/no-trigger.md",
          sourceProvider: "antigravity",
          lineCount: 2,
          byteLength: 40,
          charCount: 40,
          antigravityDefect: "missing-trigger",
        },
        {
          path: "/tmp/proj/.agents/rules/bad-trigger.md",
          sourceProvider: "antigravity",
          lineCount: 2,
          byteLength: 40,
          charCount: 40,
          antigravityDefect: "invalid-trigger",
        },
        {
          path: "/tmp/proj/.agents/rules/no-desc.md",
          sourceProvider: "antigravity",
          lineCount: 2,
          byteLength: 40,
          charCount: 40,
          antigravityDefect: "missing-description",
        },
        {
          path: "/tmp/proj/.agents/rules/no-globs.md",
          sourceProvider: "antigravity",
          lineCount: 2,
          byteLength: 40,
          charCount: 40,
          antigravityDefect: "missing-globs",
        },
        {
          path: "/tmp/proj/GEMINI.md",
          sourceProvider: "antigravity",
          lineCount: 2,
          byteLength: 24_001,
          charCount: 24_001,
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
        skill({
          id: "as-no-fm",
          path: ".agents/skills/as-no-fm",
          sourceProvider: "agent-skills",
          hasFrontmatter: false,
        }),
        skill({
          id: "grok-no-fm",
          path: ".grok/skills/grok-no-fm",
          sourceProvider: "grok",
          schemaProfile: "grok",
          hasFrontmatter: false,
        }),
        skill({
          id: "as-no-name",
          path: ".agents/skills/as-no-name",
          sourceProvider: "agent-skills",
          description: "Has a description but no name.",
        }),
        skill({
          id: "as-no-desc",
          path: ".agents/skills/as-no-desc",
          sourceProvider: "agent-skills",
          frontmatterName: "as-no-desc",
        }),
        skill({
          id: "as-bad",
          path: ".agents/skills/as-bad",
          sourceProvider: "agent-skills",
          frontmatterName: "PDF-Processing",
          description: "Bad identifier.",
        }),
        skill({
          id: `${"n".repeat(65)}`,
          path: `.agents/skills/${"n".repeat(65)}`,
          sourceProvider: "agent-skills",
          frontmatterName: "n".repeat(65),
          description: "Name is too long.",
        }),
        skill({
          id: "as-long-desc",
          path: ".agents/skills/as-long-desc",
          sourceProvider: "agent-skills",
          frontmatterName: "as-long-desc",
          description: "d".repeat(1025),
        }),
        skill({
          id: "as-compat",
          path: ".agents/skills/as-compat",
          sourceProvider: "agent-skills",
          frontmatterName: "as-compat",
          description: "Has invalid compatibility.",
          compatibilityInvalid: true,
        }),
        skill({
          id: "as-meta",
          path: ".agents/skills/as-meta",
          sourceProvider: "agent-skills",
          frontmatterName: "as-meta",
          description: "Has invalid metadata.",
          metadataInvalid: true,
        }),
        skill({
          id: "as-tools",
          path: ".agents/skills/as-tools",
          sourceProvider: "agent-skills",
          frontmatterName: "as-tools",
          description: "Has invalid allowed-tools.",
          allowedToolsInvalid: true,
        }),
        skill({
          id: "as-big",
          path: ".agents/skills/as-big",
          sourceProvider: "agent-skills",
          frontmatterName: "as-big",
          description: "Body is too large.",
          bodyLines: 501,
        }),
      ],
      mcp: [
        mcpFact({
          name: "dead",
          path: "/tmp/proj/.mcp.json",
          schemaProfile: "claude-json",
          hasCommand: false,
          hasUrl: false,
          literalEnvKeys: [],
        }),
        mcpFact({
          name: "dead-vscode",
          path: "/tmp/proj/.vscode/mcp.json",
          schemaProfile: "vscode-json",
          hasCommand: false,
          hasUrl: false,
          literalEnvKeys: [],
        }),
        mcpFact({
          name: "dead-cursor",
          path: "/tmp/proj/.cursor/mcp.json",
          schemaProfile: "cursor-json",
          hasCommand: false,
          hasUrl: false,
          literalEnvKeys: [],
        }),
        mcpFact({
          name: "dead-ag",
          path: "/tmp/proj/.agents/mcp_config.json",
          schemaProfile: "antigravity-json",
          hasCommand: false,
          hasUrl: false,
          literalEnvKeys: [],
        }),
        mcpFact({
          name: "dead-codex",
          path: "/tmp/proj/.codex/config.toml",
          schemaProfile: "codex-toml",
          hasCommand: false,
          hasUrl: false,
          literalEnvKeys: [],
        }),
        mcpFact({
          name: "dead-gemini",
          path: "/tmp/proj/.gemini/settings.json",
          schemaProfile: "gemini-json",
          hasCommand: false,
          hasUrl: false,
          literalEnvKeys: [],
        }),
        mcpFact({
          name: "my_server",
          path: "/tmp/proj/.gemini/settings.json",
          schemaProfile: "gemini-json",
          hasCommand: true,
          hasUrl: false,
          literalEnvKeys: [],
        }),
        mcpFact({
          name: "dead-opencode",
          path: "/tmp/proj/opencode.jsonc",
          schemaProfile: "opencode-json",
          hasCommand: false,
          hasUrl: false,
          literalEnvKeys: [],
        }),
        mcpFact({
          name: "oc-no-type",
          path: "/tmp/proj/opencode.jsonc",
          schemaProfile: "opencode-json",
          hasCommand: false,
          hasUrl: false,
          opencodeDefect: "missing-type",
          literalEnvKeys: [],
        }),
        mcpFact({
          name: "oc-local",
          path: "/tmp/proj/opencode.jsonc",
          schemaProfile: "opencode-json",
          hasCommand: false,
          hasUrl: false,
          transport: "local",
          opencodeDefect: "local-without-command",
          literalEnvKeys: [],
        }),
        mcpFact({
          name: "oc-remote",
          path: "/tmp/proj/opencode.jsonc",
          schemaProfile: "opencode-json",
          hasCommand: false,
          hasUrl: false,
          transport: "remote",
          opencodeDefect: "remote-without-url",
          literalEnvKeys: [],
        }),
        mcpFact({
          name: "oc-mismatch",
          path: "/tmp/proj/opencode.jsonc",
          schemaProfile: "opencode-json",
          hasCommand: true,
          hasUrl: true,
          transport: "local",
          opencodeDefect: "invalid-launch-for-type",
          literalEnvKeys: [],
        }),
        mcpFact({
          name: "oc-string-cmd",
          path: "/tmp/proj/opencode.jsonc",
          schemaProfile: "opencode-json",
          hasCommand: true,
          hasUrl: false,
          opencodeSchema: "v2",
          opencodeDefect: "command-not-array",
          literalEnvKeys: [],
        }),
        mcpFact({
          name: "dead-continue",
          path: "/tmp/proj/.continue/config.yaml",
          schemaProfile: "continue-yaml",
          hasCommand: false,
          hasUrl: false,
          literalEnvKeys: [],
        }),
        mcpFact({
          name: "block-yaml",
          path: "/tmp/proj/.continue/mcpServers/docs.yaml",
          schemaProfile: "continue-yaml",
          hasCommand: true,
          hasUrl: false,
          continueMissingMetadataKeys: ["name", "version", "schema"],
          literalEnvKeys: [],
        }),
        mcpFact({
          name: "dead-cc",
          path: "/tmp/proj/.commandcode/mcp.json",
          schemaProfile: "commandcode-json",
          hasCommand: false,
          hasUrl: false,
          literalEnvKeys: [],
        }),
        mcpFact({
          name: "dead-grok",
          path: "/tmp/proj/.grok/config.toml",
          schemaProfile: "grok-toml",
          hasCommand: false,
          hasUrl: false,
          literalEnvKeys: [],
        }),
        mcpFact({
          name: "dead-windsurf",
          path: "/home/user/.codeium/windsurf/mcp_config.json",
          schemaProfile: "windsurf-json",
          hasCommand: false,
          hasUrl: false,
          literalEnvKeys: [],
        }),
        mcpFact({
          name: "dead-qwen",
          path: "/tmp/proj/.qwen/settings.json",
          schemaProfile: "qwen-json",
          hasCommand: false,
          hasUrl: false,
          literalEnvKeys: [],
        }),
        mcpFact({
          name: "dead-devin",
          path: "/tmp/proj/.devin/mcp_config.json",
          schemaProfile: "devin-json",
          hasCommand: false,
          hasUrl: false,
          literalEnvKeys: [],
        }),
        mcpFact({
          name: "cc-bad-transport",
          path: "/tmp/proj/.mcp.json",
          schemaProfile: "mcp-json",
          hasCommand: false,
          hasUrl: false,
          transport: "ftp",
          commandcodeDefect: "invalid-transport",
          literalEnvKeys: [],
        }),
        mcpFact({
          name: "cc-http",
          path: "/tmp/proj/.mcp.json",
          schemaProfile: "mcp-json",
          hasCommand: false,
          hasUrl: false,
          transport: "http",
          commandcodeDefect: "http-without-url",
          literalEnvKeys: [],
        }),
        mcpFact({
          name: "cc-stdio",
          path: "/tmp/proj/.mcp.json",
          schemaProfile: "mcp-json",
          hasCommand: false,
          hasUrl: true,
          transport: "stdio",
          commandcodeDefect: "stdio-without-command",
          literalEnvKeys: [],
        }),
        mcpFact({
          name: "gone-cmd",
          path: "/tmp/proj/.mcp.json",
          hasCommand: true,
          hasUrl: false,
          command: "./bin/missing",
          commandExists: false,
          literalEnvKeys: [],
        }),
        mcpFact({
          name: "typeless",
          path: "/tmp/proj/.mcp.json",
          hasCommand: false,
          hasUrl: true,
          literalEnvKeys: [],
        }),
        mcpFact({
          name: "workspace",
          path: "/tmp/proj/.mcp.json",
          schemaProfile: "mcp-json",
          consumedBy: ["claude", "commandcode"],
          hasCommand: true,
          hasUrl: false,
          literalEnvKeys: [],
        }),
        mcpFact({
          name: "leaky",
          path: "/tmp/proj/.mcp.json",
          hasCommand: true,
          hasUrl: false,
          literalEnvKeys: [],
          secretLabel: secretLabelOf('{"env":{"T":"ghp_abcdefghij0123456789abcd"}}'),
        }),
        mcpFact({
          name: "literal",
          path: "/tmp/proj/.mcp.json",
          hasCommand: true,
          hasUrl: false,
          literalEnvKeys: ["API_KEY"],
        }),
        mcpFact({
          name: "header-secret",
          path: "/tmp/proj/.cursor/mcp.json",
          schemaProfile: "cursor-json",
          hasCommand: false,
          hasUrl: true,
          literalEnvKeys: [],
          literalCredentialFields: ["auth.CLIENT_SECRET"],
        }),
      ],
    });

    const noLock = baseFacts({
      hasSkillsLock: false,
      skills: [skill({ id: "a", frontmatterName: "a", description: "d" })],
    });

    // Budgets need their own fixture: they fire on aggregate size, which the
    // structural fixtures above deliberately keep small.
    const overBudget = baseFacts({
      packageManager: "bun",
      agents: Array.from({ length: 9 }, (_, i) => agentFact({
        name: `a${i}`,
        path: `/tmp/proj/.claude/agents/a${i}.md`,
        hasFrontmatter: true,
        description: "d",
      })),
      mcp: Array.from({ length: 6 }, (_, i) => mcpFact({
        name: `s${i}`,
        path: "/tmp/proj/.mcp.json",
        hasCommand: true,
        hasUrl: false,
        literalEnvKeys: [],
      })),
      policyFiles: [
        {
          path: "/tmp/proj/AGENTS.md",
          text: "run npm install\n".repeat(200),
          kind: "agents-md",
          hopsFromStart: 0,
        },
        {
          path: "/tmp/proj/AGENTS.override.md",
          text: "x".repeat(33_000),
          kind: "agents-md",
          hopsFromStart: 0,
        },
        { path: "/tmp/proj/CLAUDE.md", text: "line\n".repeat(300), kind: "claude-md" },
      ],
      // Discovery computes the chain; the override is the one file Codex loads here.
      codexInstructionChain: [
        { path: "/tmp/proj/AGENTS.override.md", text: "x".repeat(33_000), kind: "agents-md" },
      ],
    });

    const emitted = new Set([
      ...runChecks(withLock, limits({ skillListingChars: 1_000 })).map(
        (f) => f.ruleId,
      ),
      ...runChecks(noLock, { requireLock: true, ...limits() }).map((f) => f.ruleId),
      ...runChecks(overBudget, limits()).map((f) => f.ruleId),
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
        mcpFact({
          name: "x",
          path: "/tmp/proj/.mcp.json",
          hasCommand: false,
          hasUrl: false,
          literalEnvKeys: [],
        }),
      ],
    });
    const first = runChecks(facts, limits());
    const second = runChecks(facts, limits());
    expect(first).toEqual(second);
    expect(new Set(first.map((f) => f.id)).size).toBe(first.length);
    expect(ids(facts).length).toBeGreaterThan(2);
  });
});
