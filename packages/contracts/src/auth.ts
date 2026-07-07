import { z } from 'zod';

import { userProfileSchema } from './user';

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export function isSafeReturnTo(value: string): boolean {
  return (
    value.length <= 512 &&
    /^\/(?!\/)/.test(value) &&
    !value.includes('\\') &&
    !CONTROL_CHARS.test(value)
  );
}

export const returnToSchema = z.string().refine(isSafeReturnTo, {
  message: 'returnTo must be a safe relative path',
});
export type ReturnTo = z.infer<typeof returnToSchema>;

export const authMeResponseSchema = z.object({
  user: userProfileSchema.nullable(),
  needsOnboarding: z.boolean(),
});
export type AuthMeResponse = z.infer<typeof authMeResponseSchema>;

/** `returnTo` must be a relative path (leading slash) — no open redirects. */
export const oauthStartQuerySchema = z.object({
  returnTo: returnToSchema.optional(),
});
export type OAuthStartQuery = z.infer<typeof oauthStartQuerySchema>;
