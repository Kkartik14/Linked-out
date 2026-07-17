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
export const oauthStartQuerySchema = z
  .object({
    returnTo: returnToSchema.optional(),
  })
  .strict();
export type OAuthStartQuery = z.infer<typeof oauthStartQuerySchema>;

export const oauthFailureCodeSchema = z.enum([
  'access_denied',
  'oauth_failed',
  'email_taken',
]);
export type OAuthFailureCode = z.infer<typeof oauthFailureCodeSchema>;

/** Safe, server-owned copy carried by an OAuth failure redirect. */
export const oauthFailureSchema = z
  .object({
    code: oauthFailureCodeSchema,
    message: z.string().min(1),
  })
  .strict();
export type OAuthFailure = z.infer<typeof oauthFailureSchema>;

export const oauthFailureRedirectQuerySchema = z
  .object({
    error: oauthFailureCodeSchema,
    message: z.string().min(1),
  })
  .strict();
export type OAuthFailureRedirectQuery = z.infer<typeof oauthFailureRedirectQuerySchema>;

export const OAUTH_FAILURES = {
  access_denied: {
    code: 'access_denied',
    message: "You cancelled the sign-in. Try again whenever you're ready.",
  },
  oauth_failed: {
    code: 'oauth_failed',
    message: 'Something went wrong with the provider. Please try again.',
  },
  email_taken: {
    code: 'email_taken',
    message: 'That email is already linked to a different login method.',
  },
} as const satisfies Record<OAuthFailureCode, OAuthFailure>;
