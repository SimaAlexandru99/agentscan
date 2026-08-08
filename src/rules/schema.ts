import { z } from "zod";

const actionSchema = z.enum([
  "keep",
  "delete",
  "add",
  "refresh",
  "warn",
  "drift",
]);

const severitySchema = z.enum(["error", "warning", "info"]);

export const ruleThenSchema = z.object({
  action: actionSchema,
  severity: severitySchema.default("warning"),
  subject: z.string().optional(),
  message: z.string().min(1),
  reason: z.string().optional(),
  suggest: z.string().optional(),
});

/**
 * Rule definition. `when` is opaque JSON (evaluated in engine Task 6).
 * Load requires `id`, `then.action`, `then.message`.
 */
export const ruleDefinitionSchema = z.object({
  id: z.string().min(1),
  description: z.string().optional(),
  when: z.unknown(),
  then: ruleThenSchema,
});

export type RuleDefinition = z.infer<typeof ruleDefinitionSchema>;
