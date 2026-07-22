import { Inject, Injectable } from '@nestjs/common';
import type {
  EmailAuthHandoffResponse,
  EmailLoginInput,
  EmailOtpInspectInput,
  EmailOtpInspectResponse,
  EmailOtpPurpose,
  EmailOtpRequestAccepted,
  EmailOtpResendInput,
  EmailOtpVerifyInput,
  EmailSignupInput,
  ForgotPasswordInput,
  ResetPasswordInput,
} from '@linkedout/contracts';

import { AppErrors } from '../../common/errors/app-exception';
import { AppConfigService } from '../../config/app-config.service';
import {
  EMAIL_OTP_DELIVERY,
  type EmailOtpDelivery,
} from './email-otp.delivery';
import { EmailOtpCrypto } from './email-otp.crypto';
import { EmailAuthRepository } from './email-auth.repository';
import { EmailAuthRateLimiter } from './email-auth-rate-limiter';
import { OAUTH_HANDOFF_TTL_MS, OAuthHandoffService } from './oauth-handoff.service';
import { PasswordHasher } from './password-hasher';
import { PasswordSafetyService } from './password-safety.service';

export const EMAIL_OTP_TTL_SECONDS = 600 as const;
const EMAIL_OTP_TTL_MS = EMAIL_OTP_TTL_SECONDS * 1000;
const ACCEPTED: EmailOtpRequestAccepted = {
  accepted: true,
  expiresInSeconds: EMAIL_OTP_TTL_SECONDS,
};

@Injectable()
export class EmailAuthService {
  constructor(
    private readonly config: AppConfigService,
    private readonly repository: EmailAuthRepository,
    private readonly crypto: EmailOtpCrypto,
    private readonly passwords: PasswordHasher,
    private readonly passwordSafety: PasswordSafetyService,
    private readonly handoffs: OAuthHandoffService,
    private readonly rateLimits: EmailAuthRateLimiter,
    @Inject(EMAIL_OTP_DELIVERY) private readonly delivery: EmailOtpDelivery,
  ) {}

  async signup(input: EmailSignupInput): Promise<EmailOtpRequestAccepted> {
    this.ensureEnabled();
    await this.rateLimits.issue(input.email);
    // Always issue a signup code. Account existence is not checked here — doing so would turn the
    // response time into an email-existence oracle — so the reply is identical whether or not the
    // address is registered. A duplicate is rejected atomically at verify (createVerifiedAccount),
    // and no password is collected, so there is no pre-verification credential to seed or overwrite.
    // TODO(provider): when a real email provider is wired, send an "account already exists" template
    // instead of a signup code when the address already has a verified account.
    await this.issue(input.email, 'SIGNUP');
    return ACCEPTED;
  }

  async resend(input: EmailOtpResendInput): Promise<EmailOtpRequestAccepted> {
    this.ensureEnabled();
    await this.rateLimits.issue(input.email);
    // Re-send only an already-active challenge (requireExisting): resend never mints a fresh code
    // for an address that has none, so it stays non-enumerating for both purposes.
    await this.issue(input.email, input.purpose, true);
    return ACCEPTED;
  }

  async verify(input: EmailOtpVerifyInput): Promise<EmailAuthHandoffResponse> {
    this.ensureEnabled();
    const digest = this.crypto.digest(input.email, 'SIGNUP', input.otp);
    // Gate the code under the per-subject lock (attempt-count + constant-time compare) without
    // consuming it, so the five-attempt cap holds under concurrency and Argon2 runs only on a valid
    // code. The credential is authored here, by the code's holder — never earlier — which closes the
    // pre-hijacking window.
    if (!(await this.repository.verifyCode(input.email, 'SIGNUP', digest, new Date()))) {
      throw AppErrors.invalidOtp();
    }
    await this.passwordSafety.assertAcceptable(input.password);
    const passwordHash = await this.passwords.create(input.password);
    // Consume + create the account in one transaction: a hashing/DB failure never burns the code.
    const userId = await this.repository.consumeSignupAndCreateAccount(
      input.email,
      digest,
      passwordHash,
      new Date(),
    );
    if (!userId) throw AppErrors.invalidOtp();
    return this.issueHandoff(userId, input.returnTo);
  }

  async login(input: EmailLoginInput): Promise<EmailAuthHandoffResponse> {
    this.ensureEnabled();
    await this.rateLimits.login(input.email);
    const account = await this.repository.findPasswordAccount(input.email);
    const passwordHash = account?.passwordCredential?.passwordHash;
    const valid = passwordHash
      ? await this.passwords.verify(passwordHash, input.password)
      : (await this.passwords.verifyDummy(input.password), false);
    if (!valid || !account?.emailVerified) throw AppErrors.invalidCredentials();
    return this.issueHandoff(account.id, input.returnTo);
  }

  async forgotPassword(input: ForgotPasswordInput): Promise<EmailOtpRequestAccepted> {
    this.ensureEnabled();
    await this.rateLimits.issue(input.email);
    const account = await this.repository.findPasswordAccount(input.email);
    await this.passwords.verifyDummy(input.email);
    if (account?.passwordCredential && account.emailVerified) {
      await this.issue(input.email, 'PASSWORD_RESET');
    } else {
      // Keep the not-found branch non-trivial without persisting a challenge for an unknown email.
      this.crypto.digest(input.email, 'PASSWORD_RESET', this.crypto.generate());
    }
    return ACCEPTED;
  }

  async resetPassword(input: ResetPasswordInput): Promise<{ ok: true }> {
    this.ensureEnabled();
    const digest = this.crypto.digest(input.email, 'PASSWORD_RESET', input.otp);
    // Gate first (attempt-count + compare, no consume), so Argon2 runs only on a valid code.
    if (!(await this.repository.verifyCode(input.email, 'PASSWORD_RESET', digest, new Date()))) {
      throw AppErrors.invalidOtp();
    }
    await this.passwordSafety.assertAcceptable(input.newPassword);
    const passwordHash = await this.passwords.create(input.newPassword);
    // Consume the code, replace the credential, and revoke every session in one transaction, so
    // overlapping resets cannot apply out of order and a failure never burns a valid code.
    if (!(await this.repository.consumeResetAndApplyPassword(input.email, digest, passwordHash, new Date()))) {
      throw AppErrors.invalidOtp();
    }
    return { ok: true };
  }

  async inspect(
    input: EmailOtpInspectInput,
  ): Promise<EmailOtpInspectResponse> {
    this.ensureEnabled();
    await this.rateLimits.inspect(input.email);
    const challenge = await this.repository.findInspectable(input.email, input.purpose, new Date());
    if (!challenge?.outbox) throw AppErrors.invalidOtp();
    return {
      email: challenge.email,
      purpose: challenge.purpose,
      otp: this.crypto.decrypt(challenge.email, challenge.purpose, challenge.outbox),
      expiresAt: challenge.expiresAt.toISOString(),
    };
  }

  private async issue(
    email: string,
    purpose: EmailOtpPurpose,
    requireExisting = false,
  ): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + EMAIL_OTP_TTL_MS);
    const candidateOtp = this.crypto.generate();
    const issued = await this.repository.issue({
      email,
      purpose,
      codeDigest: this.crypto.digest(email, purpose, candidateOtp),
      encrypted: this.crypto.encrypt(email, purpose, candidateOtp),
      now,
      expiresAt,
      requireExisting,
    });
    if (!issued) return;
    const otp = this.crypto.decrypt(issued.email, issued.purpose, issued);
    await this.delivery.deliver({ email: issued.email, purpose: issued.purpose, otp, expiresAt: issued.expiresAt });
  }

  private async issueHandoff(userId: string, returnTo: string): Promise<EmailAuthHandoffResponse> {
    const code = await this.handoffs.issue(userId, returnTo);
    return {
      code,
      returnTo,
      expiresAt: new Date(Date.now() + OAUTH_HANDOFF_TTL_MS).toISOString(),
    };
  }

  private ensureEnabled(): void {
    if (this.config.emailOtp.deliveryMode !== 'stub') {
      throw AppErrors.providerNotConfigured('Email');
    }
  }
}
