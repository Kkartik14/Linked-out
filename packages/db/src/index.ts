import { PrismaClient } from '../generated/client';

import { ulidExtension } from './ulid';
export { modelUsesUlid } from './ulid';

export type PrismaClientOptions = ConstructorParameters<typeof PrismaClient>[0];

/**
 * Creates the one true Prisma client for the app: base client + ULID id assignment.
 * The returned type carries the extension, so consumers get the extended surface.
 */
export function createPrismaClient(options?: PrismaClientOptions) {
  return new PrismaClient(options).$extends(ulidExtension);
}

export type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;

// Runtime + type re-exports so the API layer imports everything DB-related from here.
// PrismaClient is deliberately type-only: runtime consumers must use the ULID-extended factory.
export { Prisma } from '../generated/client';
export {
  LType,
  LCategory,
  Visibility,
  ReactionType,
  JourneyStatus,
  NotificationType,
} from '../generated/client';
export type {
  PrismaClient,
  User,
  Account,
  Session,
  BrowserSession,
  VerificationToken,
  AvatarDeletionClaim,
  L,
  Reaction,
  Comment,
  Follow,
  Collection,
  CollectionL,
  Notification,
} from '../generated/client';
