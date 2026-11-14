import Link from "next/link";

import { AgentPicker } from "@/components/agent-picker";
import { AGENT_EXAMPLES } from "@/lib/home";

/** Pick an agent: the files agentscan reads for it and one finding it raises. */
export function AgentSelector() {
  return (
    <AgentPicker names={AGENT_EXAMPLES.map((agent) => agent.name)}>
      {AGENT_EXAMPLES.map((agent) => (
        <div key={agent.name} data-agent-panel>
          <div className="swap mt-6 grid grid-cols-1 overflow-hidden rounded-2xl border border-border md:grid-cols-2">
            <div className="bg-black/30 p-6">
              <p className="mb-3 font-mono text-xs text-muted-foreground">{agent.name}</p>
              <ul className="flex flex-col gap-2.5">
                {agent.files.map(([kind, path]) => (
                  <li key={`${kind}${path}`} className="grid grid-cols-[64px_minmax(0,1fr)] items-baseline gap-3">
                    <span className="font-mono text-xs text-primary">{kind}</span>
                    <code className="font-mono text-sm break-words text-foreground/85">{path}</code>
                  </li>
                ))}
              </ul>
            </div>
            <div className="border-t border-border/60 bg-card p-6 md:border-t-0 md:border-l">
              <p className="mb-2.5 font-mono text-xs text-muted-foreground">Example finding (illustrative)</p>
              <p className="font-mono text-sm leading-relaxed text-foreground/85">
                <span className="rounded bg-primary px-2 py-px text-background">{agent.sev}</span>{" "}
                <Link href={`/checks#${agent.rule}`} className="underline-offset-4 hover:underline">
                  {agent.rule}
                </Link>
              </p>
              <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{agent.msg}</p>
            </div>
          </div>
        </div>
      ))}
    </AgentPicker>
  );
}
