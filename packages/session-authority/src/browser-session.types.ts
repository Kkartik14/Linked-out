export const BROWSER_SESSION_IDLE_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000;
export const BROWSER_SESSION_ABSOLUTE_TIMEOUT_MS = 90 * 24 * 60 * 60 * 1000;
export const REVOKED_BROWSER_SESSION_RETENTION_MS = 60 * 1000;

export interface BrowserSessionClock {
  now(): Date;
}

export interface BrowserSessionTokenSource {
  generate(): string;
}

export interface BrowserSession {
  sid: string;
  sub: string;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
}

export interface CreatedBrowserSession extends BrowserSession {
  cookie: string;
  /** Absolute browser-cookie expiry; server-side idle expiry may be earlier and slides on use. */
  cookieExpiresAt: Date;
}

export interface ExchangedOAuthHandoffSession extends CreatedBrowserSession {
  returnTo: string;
}

export type BrowserSessionAuthorization =
  | { kind: 'absent' }
  | { kind: 'invalid' }
  | { kind: 'expired' }
  | { kind: 'revoked' }
  | { kind: 'authenticated'; session: BrowserSession };

export interface BrowserSessionRevocation {
  revoked: boolean;
}

export interface BrowserSessionAuthorityOptions {
  clock?: BrowserSessionClock;
  tokenSource?: BrowserSessionTokenSource;
}

export interface PersistedBrowserSession {
  sid: string;
  sub: string;
  createdAt: Date;
  lastUsedAt: Date;
}

export type CreateBrowserSessionResult =
  | { kind: 'created'; session: PersistedBrowserSession }
  | { kind: 'cookie-hash-conflict' };

export type ExchangeOAuthHandoffResult =
  | { kind: 'exchanged'; session: PersistedBrowserSession; returnTo: string }
  | { kind: 'invalid-handoff' }
  | { kind: 'cookie-hash-conflict' };

export type PersistedBrowserSessionAuthorization =
  | { kind: 'invalid' }
  | { kind: 'expired' }
  | { kind: 'revoked' }
  | { kind: 'authenticated'; session: BrowserSession };

export interface CreateBrowserSessionInput {
  cookieHash: string;
  sub: string;
  now: Date;
}

export interface ExchangeOAuthHandoffInput {
  codeHash: string;
  cookieHash: string;
  now: Date;
}

export interface AuthorizeBrowserSessionInput {
  cookieHash: string;
  now: Date;
  idleTimeoutMs: number;
  absoluteTimeoutMs: number;
}

export interface RevokeBrowserSessionInput {
  cookieHash: string;
  now: Date;
}

/** Persistence seam for the policy module; adapters own all database and transaction details. */
export interface BrowserSessionPersistence {
  create(input: CreateBrowserSessionInput): Promise<CreateBrowserSessionResult>;
  exchangeOAuthHandoff(input: ExchangeOAuthHandoffInput): Promise<ExchangeOAuthHandoffResult>;
  authorize(input: AuthorizeBrowserSessionInput): Promise<PersistedBrowserSessionAuthorization>;
  revoke(input: RevokeBrowserSessionInput): Promise<BrowserSessionRevocation>;
}
