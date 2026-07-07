import { z } from 'zod';

/** Response of PUT/DELETE /users/:username/follow. */
export const followResultSchema = z.object({
  isFollowing: z.boolean(),
  counts: z.object({
    followers: z.number().int(),
    following: z.number().int(),
  }),
});
export type FollowResult = z.infer<typeof followResultSchema>;
