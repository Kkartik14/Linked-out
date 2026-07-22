import { z } from 'zod';

import { userSummarySchema } from './user';

/** Response of PUT/DELETE /users/:username/follow. */
export const followResultSchema = z.object({
  isFollowing: z.boolean(),
  counts: z.object({
    followers: z.number().int(),
    following: z.number().int(),
  }),
});
export type FollowResult = z.infer<typeof followResultSchema>;

/**
 * One row of a follower/following directory: a user summary plus the viewer's follow
 * relationship to that user. `viewer` is always present — a signed-out viewer receives
 * `{ isFollowing: false, isSelf: false }`.
 */
export const followListUserSchema = z
  .object({
    user: userSummarySchema,
    viewer: z
      .object({
        isFollowing: z.boolean(),
        isSelf: z.boolean(),
      })
      .strict(),
  })
  .strict();
export type FollowListUser = z.infer<typeof followListUserSchema>;
