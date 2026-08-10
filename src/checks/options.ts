export type CheckOptions = {
  /** Flag a project that has skills but no skills-lock.json. Off by default. */
  requireLock?: boolean;
  /** Byte ceiling for all skill names + descriptions loaded at startup. */
  skillDescriptionBytes?: number;
  /** Budget ceilings. Absent means "do not run the budget checks at all". */
  budgets?: {
    agentsMdLines: number;
    claudeMdLines: number;
    agents: number;
    mcp: number;
  };
};
