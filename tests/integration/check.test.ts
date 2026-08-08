import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { runCheck } from "../../src/commands/check";

const fixture = join(import.meta.dir, "../fixtures/next16-redundant-skill");

describe("runCheck integration", () => {
  test("check finds redundant next skill as JSON", async () => {
    const result = await runCheck({
      dir: fixture,
      json: true,
      failOn: "never",
    });

    expect(result.exitCode).toBe(0);

    const payload = JSON.parse(result.stdout) as {
      version: string;
      findings: Array<{
        action: string;
        subject: string;
        ruleId: string;
      }>;
    };

    expect(payload.version).toBe("0.1.0");

    const deleteFinding = payload.findings.find(
      (f) =>
        f.action === "delete" &&
        f.subject === "skill:next-cache-components" &&
        f.ruleId === "next.redundant-cache-components-skill",
    );
    expect(deleteFinding).toBeDefined();
  });
});
