import { Injectable } from '@nestjs/common';
import { Prisma } from '@linkedout/db';

import { PrismaService } from '../../prisma/prisma.service';
import type { NormalizedOAuthProfile, OAuthProvider } from './oauth-profile';

export interface AuthUserRow {
  id: string;
  username: string | null;
}

export class OAuthEmailConflictError extends Error {
  constructor() {
    super('OAuth email already belongs to another account.');
    this.name = 'OAuthEmailConflictError';
  }
}

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  findLinkedUser(provider: OAuthProvider, providerAccountId: string): Promise<AuthUserRow | null> {
    return this.prisma.db.account
      .findUnique({
        where: { provider_providerAccountId: { provider, providerAccountId } },
        select: { user: { select: { id: true, username: true } } },
      })
      .then((account) => account?.user ?? null);
  }

  findUserByEmail(email: string): Promise<AuthUserRow | null> {
    return this.prisma.db.user.findUnique({
      where: { email },
      select: { id: true, username: true },
    });
  }

  findUserById(id: string): Promise<AuthUserRow | null> {
    return this.prisma.db.user.findUnique({
      where: { id },
      select: { id: true, username: true },
    });
  }

  createRefreshSession(userId: string, tokenHash: string, expiresAt: Date): Promise<{ id: string }> {
    return this.prisma.db.session.create({
      data: { userId, sessionToken: tokenHash, expires: expiresAt },
      select: { id: true },
    });
  }

  async rotateRefreshSession(
    userId: string,
    oldTokenHash: string,
    newTokenHash: string,
    expiresAt: Date,
  ): Promise<AuthUserRow | null> {
    return this.prisma.db.$transaction(async (tx) => {
      const updated = await tx.session.updateMany({
        where: { userId, sessionToken: oldTokenHash, expires: { gt: new Date() } },
        data: { sessionToken: newTokenHash, expires: expiresAt },
      });
      if (updated.count !== 1) return null;
      return tx.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true },
      });
    });
  }

  deleteRefreshSession(tokenHash: string): Promise<void> {
    return this.prisma.db.session
      .deleteMany({ where: { sessionToken: tokenHash } })
      .then(() => undefined);
  }

  async createUserWithAccount(profile: NormalizedOAuthProfile): Promise<AuthUserRow> {
    try {
      return await this.prisma.db.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: profile.email,
            name: profile.name,
            image: profile.image,
            emailVerified: profile.email ? new Date() : null,
          },
          select: { id: true, username: true },
        });
        await tx.account.create({
          data: {
            userId: user.id,
            type: 'oauth',
            provider: profile.provider,
            providerAccountId: profile.providerAccountId,
          },
          select: { id: true },
        });
        return user;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const linked = await this.findLinkedUser(profile.provider, profile.providerAccountId);
        if (linked) return linked;
        throw new OAuthEmailConflictError();
      }
      throw error;
    }
  }
}
