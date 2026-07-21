import { Injectable } from '@nestjs/common';
import type { EmailOtpPurpose } from '@linkedout/contracts';

export interface EmailOtpDeliveryMessage {
  email: string;
  purpose: EmailOtpPurpose;
  otp: string;
  expiresAt: Date;
}

export interface EmailOtpDelivery {
  deliver(message: EmailOtpDeliveryMessage): Promise<void>;
}

export const EMAIL_OTP_DELIVERY = Symbol('EMAIL_OTP_DELIVERY');

/**
 * The encrypted database outbox is the temporary delivery target. Inspection is intentionally
 * a separate protected API rather than returning the code from signup/reset endpoints.
 *
 * TODO(Kartik asked it): replace this stub with the production email provider and transactional
 * delivery worker, then remove production OTP inspection.
 */
@Injectable()
export class StubEmailOtpDelivery implements EmailOtpDelivery {
  async deliver(_message: EmailOtpDeliveryMessage): Promise<void> {
    await Promise.resolve();
  }
}
