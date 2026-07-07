import type { Request } from 'express';

/** The authenticated principal attached to a request by the JWT strategy. */
export interface AuthUser {
  id: string;
  username: string | null;
}

/** Express request after auth. `user` is present on guarded routes, optional otherwise. */
export interface AuthedRequest extends Request {
  user?: AuthUser;
}
