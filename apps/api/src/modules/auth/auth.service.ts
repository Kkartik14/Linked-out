import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { AppErrors } from '../../common/errors/app-exception';
import type { AuthUser } from '../../common/types/auth';
import { TokenService } from './token.service';
import type { NormalizedOAuthProfile } from './oauth-profile';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  /** Upserts the user + linked OAuth account, returning the authenticated principal. */
  async validateOAuthLogin(profile: NormalizedOAuthProfile): Promise<AuthUser> {
    return this.prisma.db.$transaction(async (tx) => {
      const linked = await tx.account.findUnique({
        where: {
          provider_providerAccountId: {
            provider: profile.provider,
            providerAccountId: profile.providerAccountId,
          },
        },
        select: { user: { select: { id: true, username: true } } },
      });
      if (linked) {
        return { id: linked.user.id, username: linked.user.username };
      }

      const existingByEmail = profile.email
        ? await tx.user.findUnique({
            where: { email: profile.email },
            select: { id: true, username: true },
          })
        : null;

      const user =
        existingByEmail ??
        (await tx.user.create({
          data: {
            email: profile.email,
            name: profile.name,
            image: profile.image,
            emailVerified: profile.email ? new Date() : null,
          },
          select: { id: true, username: true },
        }));

      await tx.account.create({
        data: {
          userId: user.id,
          type: 'oauth',
          provider: profile.provider,
          providerAccountId: profile.providerAccountId,
        },
        select: { id: true },
      });

      return { id: user.id, username: user.username };
    });
  }

  /** Resolves a refresh token to the current principal, or 401s. */
  async userFromRefresh(token: string): Promise<AuthUser> {
    const userId = this.tokens.verifyRefresh(token);
    if (!userId) throw AppErrors.unauthenticated();
    const user = await this.prisma.db.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true },
    });
    if (!user) throw AppErrors.unauthenticated();
    return { id: user.id, username: user.username };
  }
}
