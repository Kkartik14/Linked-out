import { z } from 'zod';

import { userProfileSchema } from './user';
import { ulidSchema } from './common';

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

export const oauthHandoffCodeSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/, 'code must be a 256-bit base64url value');
export type OAuthHandoffCode = z.infer<typeof oauthHandoffCodeSchema>;

export const oauthHandoffRedirectQuerySchema = z
  .object({ code: oauthHandoffCodeSchema })
  .strict();
export type OAuthHandoffRedirectQuery = z.infer<typeof oauthHandoffRedirectQuerySchema>;

export const oauthHandoffExchangeInputSchema = z
  .object({ code: oauthHandoffCodeSchema })
  .strict();
export type OAuthHandoffExchangeInput = z.infer<typeof oauthHandoffExchangeInputSchema>;

export const oauthHandoffExchangeResponseSchema = z
  .object({
    sub: ulidSchema,
    returnTo: returnToSchema,
  })
  .strict();
export type OAuthHandoffExchangeResponse = z.infer<
  typeof oauthHandoffExchangeResponseSchema
>;

export const oauthFailureCodeSchema = z.enum([
  'access_denied',
  'oauth_failed',
  'email_taken',
]);
export type OAuthFailureCode = z.infer<typeof oauthFailureCodeSchema>;

/** Safe, server-owned copy shared with clients through the versioned contract. */
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
