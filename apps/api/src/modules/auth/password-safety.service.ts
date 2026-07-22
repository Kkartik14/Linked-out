import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';

import { AppErrors } from '../../common/errors/app-exception';
import { AppConfigService } from '../../config/app-config.service';

export const PWNED_PASSWORDS_FETCH = Symbol('PWNED_PASSWORDS_FETCH');

const HIBP_RANGE_URL = 'https://api.pwnedpasswords.com/range/';
const MAX_RANGE_RESPONSE_BYTES = 1_000_000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHED_PREFIXES = 128;

interface CachedRange {
  expiresAt: number;
  suffixes: Set<string>;
}

/**
 * A deliberately small local safety net. It catches the most obvious passwords even when the
 * external breach corpus is unavailable; HIBP remains the comprehensive source in normal mode.
 */
const OBVIOUS_PASSWORDS = new Set([
  '123456',
  '12345678',
  '123456789',
  '1234567890',
  '11111111',
  'abc12345',
  'admin123',
  'iloveyou',
  'letmein',
  'password',
  'password1',
  'password1!',
  'qwerty123',
  'welcome1',
]);

/** HIBP Pwned Passwords client using the range API's five-character k-anonymity prefix. */
@Injectable()
export class PwnedPasswordsClient {
  private readonly cache = new Map<string, CachedRange>();
  private readonly inFlight = new Map<string, Promise<Set<string> | null>>();

  constructor(
    private readonly config: AppConfigService,
    @Inject(PWNED_PASSWORDS_FETCH) private readonly fetcher: typeof globalThis.fetch,
  ) {}

  async isCompromised(password: string): Promise<boolean | null> {
    if (this.config.pwnedPasswords.mode === 'local-only') return false;

    // SHA-1 is required by the HIBP range protocol only. Password storage remains Argon2id.
    const digest = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
    const prefix = digest.slice(0, 5);
    const suffix = digest.slice(5);
    const suffixes = await this.range(prefix);
    return suffixes === null ? null : suffixes.has(suffix);
  }

  private async range(prefix: string): Promise<Set<string> | null> {
    const cached = this.cache.get(prefix);
    if (cached && cached.expiresAt > Date.now()) return cached.suffixes;
    if (cached) this.cache.delete(prefix);

    const existing = this.inFlight.get(prefix);
    if (existing) return existing;

    const request = this.fetchRange(prefix).finally(() => this.inFlight.delete(prefix));
    this.inFlight.set(prefix, request);
    return request;
  }

  private async fetchRange(prefix: string): Promise<Set<string> | null> {
    try {
      const response = await this.fetcher(`${HIBP_RANGE_URL}${prefix}`, {
        method: 'GET',
        headers: {
          Accept: 'text/plain',
          'Add-Padding': 'true',
          'User-Agent': 'LinkedOut-Password-Safety',
        },
        signal: AbortSignal.timeout(this.config.pwnedPasswords.timeoutMs),
      });
      if (!response.ok) return null;

      const contentLength = Number(response.headers.get('content-length') ?? 0);
      if (contentLength > MAX_RANGE_RESPONSE_BYTES) return null;
      const body = await response.text();
      if (Buffer.byteLength(body, 'utf8') > MAX_RANGE_RESPONSE_BYTES) return null;

      const suffixes = new Set<string>();
      for (const line of body.split(/\r?\n/)) {
        const [candidate, count] = line.split(':', 2);
        if (candidate && /^[A-F0-9]{35}$/.test(candidate) && Number(count) > 0) {
          suffixes.add(candidate);
        }
      }
      this.remember(prefix, suffixes);
      return suffixes;
    } catch {
      return null;
    }
  }

  private remember(prefix: string, suffixes: Set<string>): void {
    this.cache.delete(prefix);
    this.cache.set(prefix, { expiresAt: Date.now() + CACHE_TTL_MS, suffixes });
    while (this.cache.size > MAX_CACHED_PREFIXES) {
      const oldest = this.cache.keys().next().value as string | undefined;
      if (!oldest) break;
      this.cache.delete(oldest);
    }
  }
}

@Injectable()
export class PasswordSafetyService {
  private readonly logger = new Logger(PasswordSafetyService.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly pwnedPasswords: PwnedPasswordsClient,
  ) {}

  async assertAcceptable(password: string): Promise<void> {
    if (OBVIOUS_PASSWORDS.has(password.toLocaleLowerCase('en-US'))) {
      throw AppErrors.passwordCompromised();
    }
    if (this.config.pwnedPasswords.mode === 'local-only') return;

    const compromised = await this.pwnedPasswords.isCompromised(password);
    if (compromised) throw AppErrors.passwordCompromised();
    if (compromised === null) {
      // Availability wins after the local safety net. Never log the password or any hash material.
      this.logger.warn('Pwned Passwords is unavailable; allowing password after local checks.');
    }
  }
}
