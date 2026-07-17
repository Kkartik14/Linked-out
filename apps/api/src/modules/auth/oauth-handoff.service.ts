import { randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { isSafeReturnTo } from '@linkedout/contracts';
import { hashOAuthHandoffCode } from '@linkedout/session-authority';

import { OAuthHandoffRepository } from './oauth-handoff.repository';

export const OAUTH_HANDOFF_TTL_MS = 60 * 1000;

const CODE_BYTES = 32;
const MAX_CREATE_ATTEMPTS = 3;

@Injectable()
export class OAuthHandoffService {
  constructor(private readonly repository: OAuthHandoffRepository) {}

  async issue(sub: string, returnTo: string): Promise<string> {
    if (!isSafeReturnTo(returnTo)) {
      throw new TypeError('OAuth handoff returnTo must be a safe relative path.');
    }

    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + OAUTH_HANDOFF_TTL_MS);
    for (let attempt = 1; attempt <= MAX_CREATE_ATTEMPTS; attempt += 1) {
      const code = randomBytes(CODE_BYTES).toString('base64url');
      const created = await this.repository.create({
        codeHash: hashOAuthHandoffCode(code),
        sub,
        returnTo,
        createdAt,
        expiresAt,
      });
      if (created) return code;
    }

    throw new Error('OAuth handoff creation exhausted its collision retry budget.');
  }
}
