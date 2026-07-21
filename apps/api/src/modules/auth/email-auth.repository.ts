import { timingSafeEqual } from 'node:crypto';

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

interface UsableChallenge {
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

  /**
   * Verify a signup OTP and, on success, create the verified account — all under one per-subject
   * advisory lock so the five-attempt ceiling and single-use guarantee cannot be bypassed by
   * concurrent guesses. A wrong code increments the attempt counter; a correct code consumes the
   * challenge and creates the user + credential in the same transaction. Returns the new user id,
   * or `null` for any invalid/exhausted/expired/already-consumed case (the caller answers all of
   * them with one generic response).
   */
  async verifyAndConsumeSignup(
    email: string,
    expectedDigest: string,
    now: Date,
  ): Promise<string | null> {
    try {
      return await this.prisma.db.$transaction(async (tx) => {
        await this.lock(tx, email, 'SIGNUP');
        const challenge = await tx.emailOtpChallenge.findUnique({
          where: { email_purpose: { email, purpose: 'SIGNUP' } },
          select: {
            id: true,
            codeDigest: true,
            passwordHash: true,
            expiresAt: true,
            consumedAt: true,
            failedAttempts: true,
          },
        });
        if (!this.usableNow(challenge, now)) return null;
        if (!this.digestsEqual(challenge.codeDigest, expectedDigest)) {
          await tx.emailOtpChallenge.update({
            where: { id: challenge.id },
            data: { failedAttempts: { increment: 1 } },
          });
          return null;
        }
        if (!challenge.passwordHash) return null;
        if (await tx.user.findUnique({ where: { email }, select: { id: true } })) return null;

        const user = await tx.user.create({
          data: { email, emailVerified: now },
          select: { id: true },
        });
        await tx.passwordCredential.create({
          data: { userId: user.id, passwordHash: challenge.passwordHash },
        });
        await tx.emailOtpChallenge.update({ where: { id: challenge.id }, data: { consumedAt: now } });
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

  /**
   * Verify a password-reset OTP under the per-subject advisory lock and, on success, consume the
   * challenge and return the owning user id. Wrong codes increment the attempt counter; the caller
   * hashes the new password and applies it via {@link applyNewPassword} only after this resolves.
   * Hashing stays outside this transaction so the lock is never held across the Argon2 cost and
   * wrong guesses never pay it.
   */
  async consumeResetChallenge(
    email: string,
    expectedDigest: string,
    now: Date,
  ): Promise<string | null> {
    return this.prisma.db.$transaction(async (tx) => {
      await this.lock(tx, email, 'PASSWORD_RESET');
      const challenge = await tx.emailOtpChallenge.findUnique({
        where: { email_purpose: { email, purpose: 'PASSWORD_RESET' } },
        select: {
          id: true,
          codeDigest: true,
          expiresAt: true,
          consumedAt: true,
          failedAttempts: true,
        },
      });
      if (!this.usableNow(challenge, now)) return null;
      if (!this.digestsEqual(challenge.codeDigest, expectedDigest)) {
        await tx.emailOtpChallenge.update({
          where: { id: challenge.id },
          data: { failedAttempts: { increment: 1 } },
        });
        return null;
      }
      const user = await tx.user.findUnique({
        where: { email },
        select: { id: true, passwordCredential: { select: { userId: true } } },
      });
      if (!user?.passwordCredential) return null;
      await tx.emailOtpChallenge.update({ where: { id: challenge.id }, data: { consumedAt: now } });
      await tx.emailOtpOutbox.deleteMany({ where: { challengeId: challenge.id } });
      return user.id;
    });
  }

  /**
   * Replace the password hash and invalidate every existing session for the user in one
   * transaction. A reset is an account-recovery event, so all legacy refresh sessions are deleted
   * and all live browser sessions revoked.
   */
  async applyNewPassword(userId: string, passwordHash: string, now: Date): Promise<void> {
    await this.prisma.db.$transaction(async (tx) => {
      await tx.passwordCredential.update({ where: { userId }, data: { passwordHash } });
      await tx.session.deleteMany({ where: { userId } });
      await tx.browserSession.updateMany({
        where: { sub: userId, revokedAt: null },
        data: { revokedAt: now },
      });
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

  /** Narrows away spent challenges: absent, consumed, expired, or attempt-exhausted. */
  private usableNow<T extends UsableChallenge>(challenge: T | null, now: Date): challenge is T {
    return (
      challenge !== null &&
      challenge.consumedAt === null &&
      challenge.expiresAt > now &&
      challenge.failedAttempts < MAX_FAILED_ATTEMPTS
    );
  }

  /** Constant-time comparison of two hex HMAC digests of equal length. */
  private digestsEqual(expected: string, candidate: string): boolean {
    const left = Buffer.from(expected, 'hex');
    const right = Buffer.from(candidate, 'hex');
    return left.length === right.length && timingSafeEqual(left, right);
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
