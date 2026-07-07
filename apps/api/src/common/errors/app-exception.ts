import { HttpException } from '@nestjs/common';
import type { FieldError } from '@linkedout/contracts';

export interface AppExceptionBody {
  code: string;
  message: string;
  details?: FieldError[];
}

/** Carries a stable machine `code` (+ optional field details) rendered by the global filter. */
export class AppException extends HttpException {
  constructor(status: number, body: AppExceptionBody) {
    super(body, status);
  }
}

export function isAppExceptionBody(value: unknown): value is AppExceptionBody {
  return (
    value !== null &&
    typeof value === 'object' &&
    'code' in value &&
    'message' in value &&
    typeof (value as { code: unknown }).code === 'string' &&
    typeof (value as { message: unknown }).message === 'string'
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
    new AppException(401, { code: 'UNAUTHENTICATED', message: 'You must be signed in.' }),
  tokenExpired: (): AppException =>
    new AppException(401, {
      code: 'TOKEN_EXPIRED',
      message: 'Your session expired. Refresh and retry.',
    }),
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
  collectionNotFound: (): AppException =>
    new AppException(404, {
      code: 'COLLECTION_NOT_FOUND',
      message: 'This collection does not exist.',
    }),
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
  rateLimited: (): AppException =>
    new AppException(429, { code: 'RATE_LIMITED', message: 'Too many requests. Try again soon.' }),
  uploadsDisabled: (): AppException =>
    new AppException(503, {
      code: 'UPLOADS_DISABLED',
      message: 'Avatar uploads are not configured on this server.',
    }),
  internal: (): AppException =>
    new AppException(500, { code: 'INTERNAL', message: 'Something went wrong.' }),
} as const;
