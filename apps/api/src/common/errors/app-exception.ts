import { HttpException } from '@nestjs/common';
import { fieldErrorSchema, type FieldError } from '@linkedout/contracts';

export const APP_ERROR_CODES = [
  'VALIDATION_ERROR',
  'BAD_CURSOR',
  'UNAUTHENTICATED',
  'TOKEN_EXPIRED',
  'INVALID_HANDOFF',
  'INVALID_OTP',
  'INVALID_CREDENTIALS',
  'PASSWORD_COMPROMISED',
  'PRINCIPAL_MISMATCH',
  'FORBIDDEN',
  'NOT_L_OWNER',
  'L_NOT_FOUND',
  'USER_NOT_FOUND',
  'COMMENT_NOT_FOUND',
  'USERNAME_TAKEN',
  'USERNAME_INVALID',
  'EMAIL_TAKEN',
  'ALREADY_FOLLOWING',
  'RATE_LIMITED',
  'PROVIDER_NOT_CONFIGURED',
  'UPLOADS_DISABLED',
  'INTERNAL',
] as const;
export type AppErrorCode = (typeof APP_ERROR_CODES)[number];
const appErrorCodeSet = new Set<string>(APP_ERROR_CODES);

export interface AppExceptionBody {
  code: AppErrorCode;
  message: string;
  details?: FieldError[];
}

export interface AppExceptionOptions {
  telemetryClassification?: 'security-rejection';
  retryAfterSeconds?: number;
}

/** Carries a stable machine `code` (+ optional field details) rendered by the global filter. */
export class AppException extends HttpException {
  readonly telemetryClassification: AppExceptionOptions['telemetryClassification'];
  readonly retryAfterSeconds: number | undefined;

  constructor(status: number, body: AppExceptionBody, options: AppExceptionOptions = {}) {
    super(body, status);
    this.telemetryClassification = options.telemetryClassification;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export function isAppExceptionBody(value: unknown): value is AppExceptionBody {
  return (
    value !== null &&
    typeof value === 'object' &&
    'code' in value &&
    'message' in value &&
    typeof (value as { code: unknown }).code === 'string' &&
    appErrorCodeSet.has((value as { code: string }).code) &&
    typeof (value as { message: unknown }).message === 'string' &&
    (!('details' in value) ||
      (Array.isArray((value as { details: unknown }).details) &&
        (value as { details: unknown[] }).details.every(
          (detail) => fieldErrorSchema.safeParse(detail).success,
        )))
  );
}

/** The full catalogue of domain errors — codes mirror contract.md §1.7. */
export const AppErrors = {
  validation: (details: FieldError[]): AppException =>
    new AppException(400, {
      code: 'VALIDATION_ERROR',
      message: 'Some fields need attention.',
      details,
    }),
  badCursor: (): AppException =>
    new AppException(400, { code: 'BAD_CURSOR', message: 'The pagination cursor is invalid.' }),
  validationMessage: (message: string): AppException =>
    new AppException(400, { code: 'VALIDATION_ERROR', message }),
  unauthenticated: (): AppException =>
    new AppException(
      401,
      { code: 'UNAUTHENTICATED', message: 'You must be signed in.' },
      { telemetryClassification: 'security-rejection' },
    ),
  tokenExpired: (): AppException =>
    new AppException(
      401,
      {
        code: 'TOKEN_EXPIRED',
        message: 'Your session expired. Refresh and retry.',
      },
      { telemetryClassification: 'security-rejection' },
    ),
  invalidHandoff: (): AppException =>
    new AppException(
      400,
      {
        code: 'INVALID_HANDOFF',
        message: 'The sign-in handoff is invalid or expired.',
      },
      { telemetryClassification: 'security-rejection' },
    ),
  invalidOtp: (): AppException =>
    new AppException(
      400,
      { code: 'INVALID_OTP', message: 'The verification code is invalid or expired.' },
      { telemetryClassification: 'security-rejection' },
    ),
  invalidCredentials: (): AppException =>
    new AppException(
      401,
      { code: 'INVALID_CREDENTIALS', message: 'The email or password is incorrect.' },
      { telemetryClassification: 'security-rejection' },
    ),
  passwordCompromised: (): AppException =>
    new AppException(422, {
      code: 'PASSWORD_COMPROMISED',
      message: 'This password appears in known data breaches. Choose a different password.',
    }),
  principalMismatch: (): AppException =>
    new AppException(
      409,
      {
        code: 'PRINCIPAL_MISMATCH',
        message: 'Your signed-in identity changed. Refresh this view before retrying.',
      },
      { telemetryClassification: 'security-rejection' },
    ),
  forbidden: (message = 'You do not have access to this.'): AppException =>
    new AppException(403, { code: 'FORBIDDEN', message }),
  onboardingRequired: (): AppException =>
    new AppException(403, {
      code: 'FORBIDDEN',
      message: 'Finish onboarding (choose a username) first.',
    }),
  notLOwner: (): AppException =>
    new AppException(403, { code: 'NOT_L_OWNER', message: 'You can only modify your own L.' }),
  lNotFound: (): AppException =>
    new AppException(404, {
      code: 'L_NOT_FOUND',
      message: 'This L does not exist or is not visible to you.',
    }),
  userNotFound: (): AppException =>
    new AppException(404, { code: 'USER_NOT_FOUND', message: 'This user does not exist.' }),
  commentNotFound: (): AppException =>
    new AppException(404, { code: 'COMMENT_NOT_FOUND', message: 'This comment does not exist.' }),
  usernameTaken: (): AppException =>
    new AppException(409, { code: 'USERNAME_TAKEN', message: 'That username is already taken.' }),
  usernameInvalid: (): AppException =>
    new AppException(422, { code: 'USERNAME_INVALID', message: 'That username is not allowed.' }),
  emailTaken: (): AppException =>
    new AppException(409, {
      code: 'EMAIL_TAKEN',
      message: 'That email is already connected to another login method.',
    }),
  alreadyFollowing: (): AppException =>
    new AppException(409, { code: 'ALREADY_FOLLOWING', message: 'You already follow this user.' }),
  rateLimited: (retryAfterSeconds?: number): AppException =>
    new AppException(
      429,
      { code: 'RATE_LIMITED', message: 'Too many requests. Try again soon.' },
      { retryAfterSeconds },
    ),
  providerNotConfigured: (provider: string): AppException =>
    new AppException(503, {
      code: 'PROVIDER_NOT_CONFIGURED',
      message: `${provider} login is not configured on this server.`,
    }),
  uploadsDisabled: (): AppException =>
    new AppException(503, {
      code: 'UPLOADS_DISABLED',
      message: 'Avatar uploads are not configured on this server.',
    }),
  internal: (): AppException =>
    new AppException(500, { code: 'INTERNAL', message: 'Something went wrong.' }),
} as const;
