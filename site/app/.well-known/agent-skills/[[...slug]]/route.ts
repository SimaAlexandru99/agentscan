import { AGENTSCAN_SKILL_DIGEST, AGENTSCAN_SKILL_MD } from "@/lib/skill";
import { PRODUCT_NAME, SITE_ORIGIN } from "@/lib/site";

export const SKILL_INDEX = {
  $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
  skills: [
    {
      name: PRODUCT_NAME,
      type: "skill-md",
      description:
        "Use when auditing or changing agent config — hooks, skills, MCP, AGENTS.md, skills-lock.json. Run before editing hooks or claiming a guard is in place.",
      url: `${SITE_ORIGIN}/.well-known/agent-skills/agentscan/SKILL.md`,
      digest: AGENTSCAN_SKILL_DIGEST,
    },
  ],
} as const;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body, null, 2) + "\n", {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300, must-revalidate",
    },
  });
}

function markdownSkill(): Response {
  return new Response(AGENTSCAN_SKILL_MD, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=300, must-revalidate",
    },
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug?: string[] }> },
) {
  const { slug = [] } = await context.params;
  const joined = slug.join("/").toLowerCase();

  if (joined === "index.json" || joined === "") {
    return jsonResponse(SKILL_INDEX);
  }

  if (joined === "agentscan/skill.md" || joined === "agentscan/skill") {
    return markdownSkill();
  }

  return new Response("Not found\n", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
