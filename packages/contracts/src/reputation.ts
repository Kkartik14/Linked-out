import { z } from 'zod';

export const reputationSchema = z.object({
  storiesShared: z.number().int(),
  lessonsShared: z.number().int(),
  lsShared: z.number().int(),
}).strict();
export type Reputation = z.infer<typeof reputationSchema>;

/** The metadata wire and reputation object share one exact set of public keys. */
export const reputationKeySchema = reputationSchema.keyof();
export type ReputationKey = z.infer<typeof reputationKeySchema>;
