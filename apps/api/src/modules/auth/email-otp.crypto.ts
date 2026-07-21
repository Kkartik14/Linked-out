import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type { EmailOtpPurpose } from '@linkedout/contracts';

import { AppConfigService } from '../../config/app-config.service';

export interface EncryptedOtp {
  ciphertext: string;
  iv: string;
  authTag: string;
}

const OTP_MAX_EXCLUSIVE = 100_000_000;
const IV_BYTES = 12;

@Injectable()
export class EmailOtpCrypto {
  constructor(private readonly config: AppConfigService) {}

  generate(): string {
    return randomInt(0, OTP_MAX_EXCLUSIVE).toString().padStart(8, '0');
  }

  digest(email: string, purpose: EmailOtpPurpose, otp: string): string {
    const pepper = this.requireSecrets().pepper;
    return createHmac('sha256', pepper)
      .update('linkedout:email-otp:v1\0')
      .update(email)
      .update('\0')
      .update(purpose)
      .update('\0')
      .update(otp)
      .digest('hex');
  }

  encrypt(email: string, purpose: EmailOtpPurpose, otp: string): EncryptedOtp {
    const key = this.encryptionKey();
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(this.associatedData(email, purpose));
    const ciphertext = Buffer.concat([cipher.update(otp, 'utf8'), cipher.final()]);
    return {
      ciphertext: ciphertext.toString('base64url'),
      iv: iv.toString('base64url'),
      authTag: cipher.getAuthTag().toString('base64url'),
    };
  }

  decrypt(email: string, purpose: EmailOtpPurpose, encrypted: EncryptedOtp): string {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey(),
      Buffer.from(encrypted.iv, 'base64url'),
    );
    decipher.setAAD(this.associatedData(email, purpose));
    decipher.setAuthTag(Buffer.from(encrypted.authTag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted.ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  inspectionSecretMatches(candidate: string | undefined): boolean {
    const expected = this.config.emailOtp.inspectionSecret;
    if (!expected || !candidate) return false;
    const expectedBytes = Buffer.from(expected);
    const candidateBytes = Buffer.from(candidate);
    return (
      expectedBytes.length === candidateBytes.length &&
      timingSafeEqual(expectedBytes, candidateBytes)
    );
  }

  private associatedData(email: string, purpose: EmailOtpPurpose): Buffer {
    return Buffer.from(`linkedout:email-otp-outbox:v1\0${email}\0${purpose}`);
  }

  private encryptionKey(): Buffer {
    const encoded = this.requireSecrets().encryptionKey;
    const key = Buffer.from(encoded, 'base64url');
    if (key.length !== 32) throw new Error('Email OTP encryption key must contain 32 bytes.');
    return key;
  }

  private requireSecrets(): { pepper: string; encryptionKey: string } {
    const { pepper, encryptionKey } = this.config.emailOtp;
    if (!pepper || !encryptionKey) throw new Error('Email OTP secrets are not configured.');
    return { pepper, encryptionKey };
  }
}
