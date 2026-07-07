import { z } from 'zod';

import { userProfileSchema } from './user';

export const authMeResponseSchema = z.object({
  user: userProfileSchema.nullable(),
  needsOnboarding: z.boolean(),
});
export type AuthMeResponse = z.infer<typeof authMeResponseSchema>;

/** `returnTo` must be a relative path (leading slash) — no open redirects. */
export const oauthStartQuerySchema = z.object({
  returnTo: z
    .string()
    .regex(/^\/(?!\/)/, 'returnTo must be a relative path')
    .max(512)
    .optional(),
});
export type OAuthStartQuery = z.infer<typeof oauthStartQuerySchema>;
