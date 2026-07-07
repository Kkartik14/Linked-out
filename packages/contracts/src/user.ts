import { z } from 'zod';

import { ulidSchema, isoTimestampSchema } from './common';
import { journeyStatusSchema } from './enums';

/** Compact author object embedded in cards. */
export const userSummarySchema = z.object({
  id: ulidSchema,
  username: z.string(),
  name: z.string().nullable(),
  image: z.string().nullable(),
  status: journeyStatusSchema.nullable(),
});
export type UserSummary = z.infer<typeof userSummarySchema>;

export const reputationSchema = z.object({
  storiesShared: z.number().int(),
  lessonsShared: z.number().int(),
  buildersHelped: z.number().int(),
  lsShared: z.number().int(),
  collectionsCreated: z.number().int(),
});
export type Reputation = z.infer<typeof reputationSchema>;

/** Full public profile (GET /users/:username). */
export const userProfileSchema = z.object({
  id: ulidSchema,
  username: z.string(),
  name: z.string().nullable(),
  image: z.string().nullable(),
  bio: z.string().nullable(),
  status: journeyStatusSchema.nullable(),
  reputation: reputationSchema,
  counts: z.object({
    followers: z.number().int(),
    following: z.number().int(),
  }),
  viewer: z.object({
    isFollowing: z.boolean(),
    isSelf: z.boolean(),
  }),
  createdAt: isoTimestampSchema,
});
export type UserProfile = z.infer<typeof userProfileSchema>;

/** PATCH /users/me — all optional; only send what changed. Nulls clear a field. */
export const updateUserInputSchema = z
  .object({
    username: z
      .string()
      .min(3)
      .max(30)
      .regex(/^[a-z0-9_]+$/, 'Use lowercase letters, numbers, and underscores'),
    name: z.string().max(80).nullable(),
    bio: z.string().max(280).nullable(),
    image: z.url().nullable(),
    status: journeyStatusSchema.nullable(),
  })
  .partial();
export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;
