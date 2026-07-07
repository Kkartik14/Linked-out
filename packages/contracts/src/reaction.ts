import { z } from 'zod';

import { reactionTypeSchema } from './enums';

/** Denormalized reaction counts on an L. */
export const reactionsSummarySchema = z.object({
  total: z.number().int(),
  beenThere: z.number().int(),
  helpful: z.number().int(),
  respect: z.number().int(),
  pain: z.number().int(),
  saved: z.number().int(),
});
export type ReactionsSummary = z.infer<typeof reactionsSummarySchema>;

/** Response of PUT/DELETE /ls/:id/reactions/:type. */
export const reactionResultSchema = z.object({
  reactions: reactionsSummarySchema,
  viewer: z.object({
    reactions: z.array(reactionTypeSchema),
  }),
});
export type ReactionResult = z.infer<typeof reactionResultSchema>;
