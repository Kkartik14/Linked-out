import { Inject, Injectable } from '@nestjs/common';
import { BrowserSessionAuthority } from '@linkedout/session-authority';
import {
  type OAuthHandoffExchangeResponse,
  type SessionResolveResponse,
  type SessionRevokeResponse,
} from '@linkedout/contracts';
import { ApiAssertionSigner } from '@linkedout/internal-auth';

export const API_ASSERTION_SIGNER = Symbol('API_ASSERTION_SIGNER');

/**
 * Authoritative BFF session module.
 *
 * Its small interface owns the complete server-side lifecycle: an OAuth handoff becomes a
 * browser session, a live cookie becomes an API-issued user assertion, and logout tombstones
 * the row. The caller can forward signed claims but never possesses the API signing key.
 */
@Injectable()
export class BffSessionService {
  constructor(
    private readonly authority: BrowserSessionAuthority,
    @Inject(API_ASSERTION_SIGNER)
    private readonly assertionSigner: ApiAssertionSigner | null,
  ) {}

  async exchangeOAuthHandoff(code: string): Promise<OAuthHandoffExchangeResponse | null> {
    const session = await this.authority.exchangeOAuthHandoff(code);
    if (!session) return null;
    return {
      cookie: session.cookie,
      expiresAt: session.cookieExpiresAt.toISOString(),
      returnTo: session.returnTo,
    };
  }

  async resolve(cookie: string): Promise<SessionResolveResponse> {
    const outcome = await this.authority.authorize(cookie);
    if (outcome.kind !== 'authenticated') {
      // `absent` cannot occur because the HTTP contract requires a non-empty cookie. Keeping the
      // check explicit prevents an upstream widening from silently publishing an impossible state.
      if (outcome.kind === 'absent') {
        throw new Error('Session resolution received an absent cookie after validation.');
      }
      return { status: 'unauthenticated', reason: outcome.kind };
    }

    if (!this.assertionSigner) {
      throw new Error('API assertion signing is not configured.');
    }
    const signed = this.assertionSigner.sign({
      sub: outcome.session.sub,
      sid: outcome.session.sid,
    });
    return {
      status: 'authenticated',
      assertion: signed.assertion,
      expiresAt: signed.expiresAt.toISOString(),
    };
  }

  async revoke(cookie: string): Promise<SessionRevokeResponse> {
    await this.authority.revoke(cookie);
    return { ok: true };
  }
}
