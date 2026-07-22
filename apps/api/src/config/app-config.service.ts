import { Injectable } from '@nestjs/common';

import { deploymentEnvironment } from './deployment-env';
import { envSchema, type Env } from './env';

export interface OAuthProviderConfig {
  clientId: string;
  clientSecret: string;
  configured: boolean;
}

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
  endpoint: string;
  configured: boolean;
}

export interface EmailOtpConfig {
  deliveryMode: Env['EMAIL_DELIVERY_MODE'];
  pepper: string | undefined;
  encryptionKey: string | undefined;
  inspectionSecret: string | undefined;
}

export interface PwnedPasswordsConfig {
  mode: Env['PWNED_PASSWORDS_MODE'];
  timeoutMs: number;
}

/** Typed, validated access to the environment. No `process.env` reads elsewhere. */
@Injectable()
export class AppConfigService {
  private readonly env: Env;

  constructor() {
    this.env = envSchema.parse(deploymentEnvironment());
  }

  get nodeEnv(): Env['NODE_ENV'] {
    return this.env.NODE_ENV;
  }

  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }

  get port(): number {
    return this.env.PORT;
  }

  get apiBaseUrl(): string {
    return this.env.API_BASE_URL;
  }

  get webUrl(): string {
    return this.env.WEB_URL;
  }

  get trustProxyHops(): number {
    return this.env.TRUST_PROXY_HOPS;
  }

  get jwtAccessSecret(): string {
    return this.env.JWT_ACCESS_SECRET;
  }

  get jwtRefreshSecret(): string {
    return this.env.JWT_REFRESH_SECRET;
  }

  get internalApiSecret(): string | undefined {
    return this.env.INTERNAL_API_SECRET.length > 0 ? this.env.INTERNAL_API_SECRET : undefined;
  }

  get bffCallerSecret(): string | undefined {
    return this.env.BFF_CALLER_SECRET.length > 0 ? this.env.BFF_CALLER_SECRET : undefined;
  }

  get oauthSessionMode(): Env['OAUTH_SESSION_MODE'] {
    return this.env.OAUTH_SESSION_MODE;
  }

  /** Handoff callbacks enter through the public BFF; legacy callbacks still enter Nest. */
  get oauthCallbackBaseUrl(): string {
    return this.oauthSessionMode === 'handoff'
      ? this.env.PUBLIC_OAUTH_CALLBACK_BASE_URL
      : this.apiBaseUrl;
  }

  /** Handoff state is host-only; legacy keeps its bounded cross-subdomain compatibility. */
  get oauthStateCookieDomain(): string | undefined {
    return this.oauthSessionMode === 'legacy' ? this.cookieDomain : undefined;
  }

  /** Empty in dev (host-only cookie on localhost); e.g. ".linkedout.app" in prod. */
  get cookieDomain(): string | undefined {
    return this.env.COOKIE_DOMAIN.length > 0 ? this.env.COOKIE_DOMAIN : undefined;
  }

  get emailOtp(): EmailOtpConfig {
    return {
      deliveryMode: this.env.EMAIL_DELIVERY_MODE,
      pepper: this.env.EMAIL_OTP_PEPPER || undefined,
      encryptionKey: this.env.EMAIL_OTP_ENCRYPTION_KEY || undefined,
      inspectionSecret: this.env.EMAIL_OTP_INSPECTION_SECRET || undefined,
    };
  }

  get pwnedPasswords(): PwnedPasswordsConfig {
    return {
      mode: this.env.PWNED_PASSWORDS_MODE,
      timeoutMs: this.env.PWNED_PASSWORDS_TIMEOUT_MS,
    };
  }

  get google(): OAuthProviderConfig {
    return {
      clientId: this.env.GOOGLE_CLIENT_ID,
      clientSecret: this.env.GOOGLE_CLIENT_SECRET,
      configured: this.env.GOOGLE_CLIENT_ID.length > 0 && this.env.GOOGLE_CLIENT_SECRET.length > 0,
    };
  }

  get github(): OAuthProviderConfig {
    return {
      clientId: this.env.GITHUB_CLIENT_ID,
      clientSecret: this.env.GITHUB_CLIENT_SECRET,
      configured: this.env.GITHUB_CLIENT_ID.length > 0 && this.env.GITHUB_CLIENT_SECRET.length > 0,
    };
  }

  get r2(): R2Config {
    const configured =
      this.env.R2_ENDPOINT.length > 0 &&
      this.env.R2_ACCESS_KEY_ID.length > 0 &&
      this.env.R2_SECRET_ACCESS_KEY.length > 0 &&
      this.env.R2_PUBLIC_BASE_URL.length > 0;
    return {
      accountId: this.env.R2_ACCOUNT_ID,
      accessKeyId: this.env.R2_ACCESS_KEY_ID,
      secretAccessKey: this.env.R2_SECRET_ACCESS_KEY,
      bucket: this.env.R2_BUCKET,
      publicBaseUrl: this.env.R2_PUBLIC_BASE_URL,
      endpoint: this.env.R2_ENDPOINT,
      configured,
    };
  }
}
