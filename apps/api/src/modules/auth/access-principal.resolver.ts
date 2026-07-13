import { Injectable } from '@nestjs/common';

import type { AuthUser } from '../../common/types/auth';
import { AuthRepository } from './auth.repository';

export interface AccessTokenClaims {
  sub: string;
  username: string | null;
  iat: number;
  exp: number;
}

interface CachedPrincipal {
  principal: AuthUser | null;
  expiresAtMs: number;
}

/**
 * Confirms a signed access token names a live user on its first use, not on every request.
 *
 * A hard-deleted user must not remain an accepted request principal, but an unconditional User
 * lookup in JwtStrategy made every authenticated request pay for that invariant. Access tokens
 * live for only 15 minutes, so their immutable claims form a bounded cache key. Positive and
 * negative decisions expire with the token; concurrent first requests share one lookup. As
 * with any short-lived bearer token, deleting a user after a positive decision is eventually
 * consistent until that token expires; immediate revocation belongs to the stateful BFF design
 * in ADR 0001.
 */
@Injectable()
export class AccessPrincipalResolver {
  private readonly cache = new Map<string, CachedPrincipal>();
  private readonly pending = new Map<string, Promise<AuthUser | null>>();
  private resolutionCount = 0;

  constructor(private readonly repository: AuthRepository) {}

  resolve(claims: AccessTokenClaims): Promise<AuthUser | null> {
    const nowMs = Date.now();
    this.pruneExpired(nowMs);
    const key = this.cacheKey(claims);
    const cached = this.cache.get(key);
    if (cached && cached.expiresAtMs > nowMs) return Promise.resolve(cached.principal);

    const inFlight = this.pending.get(key);
    if (inFlight) return inFlight;

    const resolution = this.repository
      .findAccessPrincipal(claims.sub)
      .then((principal) => {
        const value = principal ? { id: principal.id, username: principal.username } : null;
        const expiresAtMs = claims.exp * 1000;
        if (expiresAtMs > Date.now()) {
          this.cache.set(key, { principal: value, expiresAtMs });
        }
        return value;
      })
      .finally(() => {
        if (this.pending.get(key) === resolution) this.pending.delete(key);
      });
    this.pending.set(key, resolution);
    return resolution;
  }

  private cacheKey(claims: AccessTokenClaims): string {
    return `${claims.sub}\u0000${claims.username ?? ''}\u0000${claims.iat}\u0000${claims.exp}`;
  }

  private pruneExpired(nowMs: number): void {
    this.resolutionCount += 1;
    if (this.resolutionCount % 1024 !== 0) return;
    for (const [key, cached] of this.cache) {
      if (cached.expiresAtMs <= nowMs) this.cache.delete(key);
    }
  }
}
