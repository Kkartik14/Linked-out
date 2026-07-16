import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import type { CookieOptions, Response } from 'express';

import { AppConfigService } from '../../config/app-config.service';
import type { AuthUser } from '../../common/types/auth';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../../common/http/cookies';

export { ACCESS_COOKIE, REFRESH_COOKIE };

const ACCESS_TTL = '15m';
const REFRESH_TTL = '30d';
const ACCESS_MAX_AGE_MS = 15 * 60 * 1000;
const REFRESH_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

interface RefreshPayload {
  sub: string;
  jti: string;
}

function isRefreshPayload(value: unknown): value is RefreshPayload {
  return (
    value !== null &&
    typeof value === 'object' &&
    'sub' in value &&
    'jti' in value &&
    typeof (value as { sub: unknown }).sub === 'string' &&
    typeof (value as { jti: unknown }).jti === 'string'
  );
}

export interface RefreshTokenIssue {
  token: string;
  tokenHash: string;
  expiresAt: Date;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {}

  private signAccess(user: AuthUser): string {
    return this.jwt.sign(
      { sub: user.id, username: user.username },
      { secret: this.config.jwtAccessSecret, expiresIn: ACCESS_TTL },
    );
  }

  private signRefresh(userId: string, jti: string): string {
    return this.jwt.sign(
      { sub: userId, jti },
      { secret: this.config.jwtRefreshSecret, expiresIn: REFRESH_TTL },
    );
  }

  issueRefresh(userId: string): RefreshTokenIssue {
    const token = this.signRefresh(userId, randomBytes(24).toString('base64url'));
    return {
      token,
      tokenHash: this.hashRefresh(token),
      expiresAt: new Date(Date.now() + REFRESH_MAX_AGE_MS),
    };
  }

  hashRefresh(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Returns the user id from a valid refresh token, or null if invalid/expired. */
  verifyRefresh(token: string): string | null {
    let decoded: unknown;
    try {
      decoded = this.jwt.verify(token, { secret: this.config.jwtRefreshSecret });
    } catch {
      return null;
    }
    return isRefreshPayload(decoded) ? decoded.sub : null;
  }

  setAuthCookies(res: Response, user: AuthUser, refreshToken: string): void {
    res.cookie(ACCESS_COOKIE, this.signAccess(user), this.cookieOptions(ACCESS_MAX_AGE_MS));
    res.cookie(REFRESH_COOKIE, refreshToken, this.cookieOptions(REFRESH_MAX_AGE_MS));
  }

  setAccessCookie(res: Response, user: AuthUser): void {
    res.cookie(ACCESS_COOKIE, this.signAccess(user), this.cookieOptions(ACCESS_MAX_AGE_MS));
  }

  setRefreshCookie(res: Response, refreshToken: string): void {
    res.cookie(REFRESH_COOKIE, refreshToken, this.cookieOptions(REFRESH_MAX_AGE_MS));
  }

  clearAuthCookies(res: Response): void {
    const base = this.cookieOptions(0);
    res.clearCookie(ACCESS_COOKIE, base);
    res.clearCookie(REFRESH_COOKIE, base);
  }

  private cookieOptions(maxAgeMs: number): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.isProduction,
      sameSite: 'lax',
      domain: this.config.cookieDomain,
      path: '/',
      maxAge: maxAgeMs,
    };
  }
}
