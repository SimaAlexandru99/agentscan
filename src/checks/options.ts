export type CheckOptions = {
  /** Flag a project that has skills but no skills-lock.json. Off by default. */
  requireLock?: boolean;
  /**
   * @deprecated accepted for one release as an alias of `skillListingChars`.
   * Do not treat 16000 bytes as the Claude listing budget.
   */
  skillDescriptionBytes?: number;
  /** Character ceiling for Claude skill listing text (description + when_to_use). */
  skillListingChars?: number;
  /** Per-entry cap applied before summing listing text. Default 1536. */
  skillListingMaxDescChars?: number;
  /** Budget ceilings. Absent means "do not run the budget checks at all". */
  budgets?: {
    agentsMdLines: number;
    claudeMdLines: number;
    agents: number;
    mcp: number;
  };
};
