import type { AuthUser } from '../types/auth';

export const REQUEST_AUTHENTICATION = Symbol('REQUEST_AUTHENTICATION');

export type InternalRequestAuthentication =
  | { kind: 'invalid' }
  | { kind: 'expired' }
  | { kind: 'authenticated'; user: AuthUser; sid: string };

/** Feature-neutral port used by the HTTP guards; the auth module supplies the implementation. */
export interface RequestAuthentication {
  authenticateInternal(assertion: string): Promise<InternalRequestAuthentication>;
}
