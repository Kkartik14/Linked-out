import { Injectable } from '@nestjs/common';

import { AppErrors } from '../../common/errors/app-exception';
import type { AuthUser } from '../../common/types/auth';
import { TokenService } from './token.service';
import type { NormalizedOAuthProfile } from './oauth-profile';
import { AuthRepository, OAuthEmailConflictError } from './auth.repository';

@Injectable()
export class AuthService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly tokens: TokenService,
  ) {}

  /** Upserts the user + linked OAuth account, returning the authenticated principal. */
  async validateOAuthLogin(profile: NormalizedOAuthProfile): Promise<AuthUser> {
    const linked = await this.repo.findLinkedUser(profile.provider, profile.providerAccountId);
    if (linked) return { id: linked.id, username: linked.username };

    if (profile.email && (await this.repo.findUserByEmail(profile.email))) {
      throw AppErrors.emailTaken();
    }

    try {
      const user = await this.repo.createUserWithAccount(profile);
      return { id: user.id, username: user.username };
    } catch (error) {
      if (error instanceof OAuthEmailConflictError) {
        throw AppErrors.emailTaken();
      }
      throw error;
    }
  }

  /** Resolves a refresh token to the current principal, or 401s. */
  async startSession(user: AuthUser): Promise<{ refreshToken: string }> {
    const refresh = this.tokens.issueRefresh(user.id);
    await this.repo.createRefreshSession(user.id, refresh.tokenHash, refresh.expiresAt);
    return { refreshToken: refresh.token };
  }

  /** Rotates a refresh token and resolves it to the current principal, or 401s. */
  async rotateRefresh(token: string): Promise<{ user: AuthUser; refreshToken: string }> {
    const userId = this.tokens.verifyRefresh(token);
    if (!userId) throw AppErrors.unauthenticated();
    const refresh = this.tokens.issueRefresh(userId);
    const user = await this.repo.rotateRefreshSession(
      userId,
      this.tokens.hashRefresh(token),
      refresh.tokenHash,
      refresh.expiresAt,
    );
    if (!user) throw AppErrors.unauthenticated();
    return { user: { id: user.id, username: user.username }, refreshToken: refresh.token };
  }

  async revokeRefresh(token: string): Promise<void> {
    if (!this.tokens.verifyRefresh(token)) return;
    await this.repo.deleteRefreshSession(this.tokens.hashRefresh(token));
  }
}
