import { z } from 'zod';

import { userProfileSchema } from './user';
import { isoTimestampSchema, ulidSchema } from './common';

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

/** Render-time identity echoed by authenticated mutations to prevent stale-principal writes. */
export const PRINCIPAL_BINDING_HEADER = 'X-LinkedOut-Principal';
export const principalBindingHeaderSchema = ulidSchema;
export type PrincipalBindingHeader = z.infer<typeof principalBindingHeaderSchema>;

export const authMeResponseSchema = z.object({
  user: userProfileSchema.nullable(),
  needsOnboarding: z.boolean(),
});
export type AuthMeResponse = z.infer<typeof authMeResponseSchema>;

export const EMAIL_OTP_INSPECTION_HEADER = 'X-LinkedOut-OTP-Inspection';
export const emailOtpPurposeSchema = z.enum(['SIGNUP', 'PASSWORD_RESET']);
export type EmailOtpPurpose = z.infer<typeof emailOtpPurposeSchema>;

export const emailAddressSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(254));

// NIST SP 800-63B's current minimum for a password used as a single factor is 15 characters.
// Composition rules are deliberately absent; long passphrases and password-manager output work.
export const passwordSchema = z.string().min(15).max(128);
export const emailOtpSchema = z.string().regex(/^\d{8}$/, 'otp must contain exactly 8 digits');

export const emailSignupInputSchema = z
  .object({ email: emailAddressSchema, password: passwordSchema })
  .strict();
export type EmailSignupInput = z.infer<typeof emailSignupInputSchema>;

export const emailOtpRequestAcceptedSchema = z
  .object({ accepted: z.literal(true), expiresInSeconds: z.literal(600) })
  .strict();
export type EmailOtpRequestAccepted = z.infer<typeof emailOtpRequestAcceptedSchema>;

export const emailOtpVerifyInputSchema = z
  .object({
    email: emailAddressSchema,
    otp: emailOtpSchema,
    returnTo: returnToSchema.default('/'),
  })
  .strict();
export type EmailOtpVerifyInput = z.infer<typeof emailOtpVerifyInputSchema>;

export const emailLoginInputSchema = z
  .object({
    email: emailAddressSchema,
    password: z.string().min(1).max(128),
    returnTo: returnToSchema.default('/'),
  })
  .strict();
export type EmailLoginInput = z.infer<typeof emailLoginInputSchema>;

export const emailAuthHandoffResponseSchema = z
  .object({
    code: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    expiresAt: isoTimestampSchema,
    returnTo: returnToSchema,
  })
  .strict();
export type EmailAuthHandoffResponse = z.infer<typeof emailAuthHandoffResponseSchema>;

export const emailOtpResendInputSchema = z
  .object({ email: emailAddressSchema, purpose: emailOtpPurposeSchema })
  .strict();
export type EmailOtpResendInput = z.infer<typeof emailOtpResendInputSchema>;

export const forgotPasswordInputSchema = z.object({ email: emailAddressSchema }).strict();
export type ForgotPasswordInput = z.infer<typeof forgotPasswordInputSchema>;

export const resetPasswordInputSchema = z
  .object({ email: emailAddressSchema, otp: emailOtpSchema, newPassword: passwordSchema })
  .strict();
export type ResetPasswordInput = z.infer<typeof resetPasswordInputSchema>;

export const emailOtpInspectInputSchema = z
  .object({ email: emailAddressSchema, purpose: emailOtpPurposeSchema })
  .strict();
export type EmailOtpInspectInput = z.infer<typeof emailOtpInspectInputSchema>;

export const emailOtpInspectResponseSchema = z
  .object({
    email: emailAddressSchema,
    purpose: emailOtpPurposeSchema,
    otp: emailOtpSchema,
    expiresAt: isoTimestampSchema,
  })
  .strict();
export type EmailOtpInspectResponse = z.infer<typeof emailOtpInspectResponseSchema>;

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
    cookie: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'cookie must be a 256-bit base64url value'),
    // Absolute browser-cookie cap. Server-side idle expiry is authoritative and slides on use.
    expiresAt: isoTimestampSchema,
    returnTo: returnToSchema,
  })
  .strict();
export type OAuthHandoffExchangeResponse = z.infer<
  typeof oauthHandoffExchangeResponseSchema
>;

/**
 * Session introspection for the one-origin BFF (ADR 0001 §4.2).
 *
 * The BFF presents the opaque `lo_sid` to the private API. A purpose-scoped caller assertion
 * authenticates the BFF; the cookie selects the session. The API returns its own short-lived
 * user assertion, so identity is API-signed rather than accepted as caller-controlled fields.
 */
export const sessionResolveInputSchema = z.object({ cookie: z.string().min(1) }).strict();
export type SessionResolveInput = z.infer<typeof sessionResolveInputSchema>;

/**
 * `expiresAt` is the API assertion expiry, not the longer browser-session expiry. The caller
 * must never cache or forward the assertion beyond that instant. An absent browser cookie is
 * handled locally by the BFF, so every unauthenticated response here describes a credential
 * that was actually presented.
 */
export const sessionResolveResponseSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('authenticated'),
      assertion: z.string().min(1).max(2048),
      expiresAt: isoTimestampSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal('unauthenticated'),
      reason: z.enum(['invalid', 'expired', 'revoked']),
    })
    .strict(),
]);
export type SessionResolveResponse = z.infer<typeof sessionResolveResponseSchema>;

export const sessionRevokeInputSchema = z.object({ cookie: z.string().min(1) }).strict();
export type SessionRevokeInput = z.infer<typeof sessionRevokeInputSchema>;

export const sessionRevokeResponseSchema = z.object({ ok: z.literal(true) }).strict();
export type SessionRevokeResponse = z.infer<typeof sessionRevokeResponseSchema>;

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
