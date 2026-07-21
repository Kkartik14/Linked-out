import { Injectable } from '@nestjs/common';
import { Prisma, type EmailOtpPurpose } from '@linkedout/db';

import { PrismaService } from '../../prisma/prisma.service';
import type { EncryptedOtp } from './email-otp.crypto';

export interface IssuedEmailOtp {
  email: string;
  purpose: EmailOtpPurpose;
  expiresAt: Date;
  ciphertext: string;
  iv: string;
  authTag: string;
}

export interface ChallengeForVerification {
  codeDigest: string;
  expiresAt: Date;
  consumedAt: Date | null;
  failedAttempts: number;
}

const MAX_FAILED_ATTEMPTS = 5;

@Injectable()
export class EmailAuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  findPasswordAccount(email: string) {
    return this.prisma.db.user.findUnique({
      where: { email },
      select: {
        id: true,
        username: true,
        emailVerified: true,
        passwordCredential: { select: { passwordHash: true } },
      },
    });
  }

  async issue(input: {
    email: string;
    purpose: EmailOtpPurpose;
    codeDigest: string;
    encrypted: EncryptedOtp;
    passwordHash?: string;
    now: Date;
    expiresAt: Date;
    requireExisting?: boolean;
  }): Promise<IssuedEmailOtp | null> {
    return this.prisma.db.$transaction(async (tx) => {
      await this.lock(tx, input.email, input.purpose);
      const current = await tx.emailOtpChallenge.findUnique({
        where: { email_purpose: { email: input.email, purpose: input.purpose } },
        include: { outbox: true },
      });
      if (input.requireExisting && !current) return null;

      const active =
        current &&
        current.consumedAt === null &&
        current.failedAttempts < MAX_FAILED_ATTEMPTS &&
        current.expiresAt > input.now &&
        current.outbox !== null;
      if (active) {
        const updated = await tx.emailOtpChallenge.update({
          where: { id: current.id },
          data: {
            deliveryCount: { increment: 1 },
            ...(input.passwordHash ? { passwordHash: input.passwordHash } : {}),
          },
          include: { outbox: true },
        });
        if (!updated.outbox) throw new Error('Active OTP challenge is missing its stub outbox.');
        return this.issued(updated, updated.outbox);
      }

      const passwordHash =
        input.purpose === 'SIGNUP' ? (input.passwordHash ?? current?.passwordHash) : null;
      if (input.purpose === 'SIGNUP' && !passwordHash) return null;

      const challenge = current
        ? await tx.emailOtpChallenge.update({
            where: { id: current.id },
            data: {
              codeDigest: input.codeDigest,
              passwordHash,
              failedAttempts: 0,
              deliveryCount: 1,
              createdAt: input.now,
              expiresAt: input.expiresAt,
              consumedAt: null,
            },
          })
        : await tx.emailOtpChallenge.create({
            data: {
              email: input.email,
              purpose: input.purpose,
              codeDigest: input.codeDigest,
              passwordHash,
              createdAt: input.now,
              expiresAt: input.expiresAt,
            },
          });
      const outbox = await tx.emailOtpOutbox.upsert({
        where: { challengeId: challenge.id },
        create: { challengeId: challenge.id, ...input.encrypted, createdAt: input.now },
        update: { ...input.encrypted, createdAt: input.now },
      });
      return this.issued(challenge, outbox);
    });
  }

  getChallenge(email: string, purpose: EmailOtpPurpose): Promise<ChallengeForVerification | null> {
    return this.prisma.db.emailOtpChallenge.findUnique({
      where: { email_purpose: { email, purpose } },
      select: { codeDigest: true, expiresAt: true, consumedAt: true, failedAttempts: true },
    });
  }

  async recordFailure(email: string, purpose: EmailOtpPurpose, now: Date): Promise<void> {
    await this.prisma.db.$transaction(async (tx) => {
      await this.lock(tx, email, purpose);
      await tx.emailOtpChallenge.updateMany({
        where: {
          email,
          purpose,
          consumedAt: null,
          expiresAt: { gt: now },
          failedAttempts: { lt: MAX_FAILED_ATTEMPTS },
        },
        data: { failedAttempts: { increment: 1 } },
      });
    });
  }

  async completeSignup(email: string, expectedDigest: string, now: Date): Promise<string | null> {
    try {
      return await this.prisma.db.$transaction(async (tx) => {
        await this.lock(tx, email, 'SIGNUP');
        const challenge = await tx.emailOtpChallenge.findUnique({
          where: { email_purpose: { email, purpose: 'SIGNUP' } },
        });
        if (!challenge || !this.usable(challenge, expectedDigest, now) || !challenge.passwordHash) {
          return null;
        }
        if (await tx.user.findUnique({ where: { email }, select: { id: true } })) return null;

        const user = await tx.user.create({
          data: {
            email,
            emailVerified: now,
          },
          select: { id: true },
        });
        await tx.passwordCredential.create({
          data: { userId: user.id, passwordHash: challenge.passwordHash },
        });
        await tx.emailOtpChallenge.update({
          where: { id: challenge.id },
          data: { consumedAt: now },
        });
        await tx.emailOtpOutbox.deleteMany({ where: { challengeId: challenge.id } });
        return user.id;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return null;
      }
      throw error;
    }
  }

  async completePasswordReset(
    email: string,
    expectedDigest: string,
    passwordHash: string,
    now: Date,
  ): Promise<boolean> {
    return this.prisma.db.$transaction(async (tx) => {
      await this.lock(tx, email, 'PASSWORD_RESET');
      const challenge = await tx.emailOtpChallenge.findUnique({
        where: { email_purpose: { email, purpose: 'PASSWORD_RESET' } },
      });
      if (!challenge || !this.usable(challenge, expectedDigest, now)) return false;
      const user = await tx.user.findUnique({
        where: { email },
        select: { id: true, passwordCredential: { select: { userId: true } } },
      });
      if (!user?.passwordCredential) return false;

      await tx.passwordCredential.update({
        where: { userId: user.id },
        data: { passwordHash },
      });
      await Promise.all([
        tx.session.deleteMany({ where: { userId: user.id } }),
        tx.browserSession.updateMany({
          where: { sub: user.id, revokedAt: null },
          data: { revokedAt: now },
        }),
      ]);
      await tx.emailOtpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: now },
      });
      await tx.emailOtpOutbox.deleteMany({ where: { challengeId: challenge.id } });
      return true;
    });
  }

  async findInspectable(email: string, purpose: EmailOtpPurpose, now: Date) {
    return this.prisma.db.emailOtpChallenge.findFirst({
      where: {
        email,
        purpose,
        consumedAt: null,
        expiresAt: { gt: now },
        failedAttempts: { lt: MAX_FAILED_ATTEMPTS },
      },
      include: { outbox: true },
    });
  }

  private usable(
    challenge: {
      codeDigest: string;
      expiresAt: Date;
      consumedAt: Date | null;
      failedAttempts: number;
    } | null,
    expectedDigest: string,
    now: Date,
  ): boolean {
    return Boolean(
      challenge &&
        challenge.codeDigest === expectedDigest &&
        challenge.consumedAt === null &&
        challenge.expiresAt > now &&
        challenge.failedAttempts < MAX_FAILED_ATTEMPTS,
    );
  }

  private lock(
    tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
    email: string,
    purpose: EmailOtpPurpose,
  ): Promise<unknown> {
    return tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`linkedout:email-otp:${purpose}:${email}`}, 0))::text AS "locked"`;
  }

  private issued(
    challenge: { email: string; purpose: EmailOtpPurpose; expiresAt: Date },
    outbox: EncryptedOtp,
  ): IssuedEmailOtp {
    return { ...challenge, ...outbox };
  }
}
