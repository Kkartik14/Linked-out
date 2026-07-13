import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, type StrategyOptionsWithoutRequest } from 'passport-jwt';
import type { Request } from 'express';

import { AppConfigService } from '../../../config/app-config.service';
import { getCookie } from '../../../common/http/cookies';
import type { AuthUser } from '../../../common/types/auth';
import {
  AccessPrincipalResolver,
  type AccessTokenClaims,
} from '../access-principal.resolver';
import { ACCESS_COOKIE } from '../token.service';

function accessTokenFromCookie(req: Request): string | null {
  return getCookie(req, ACCESS_COOKIE);
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: AppConfigService,
    private readonly principals: AccessPrincipalResolver,
  ) {
    const options: StrategyOptionsWithoutRequest = {
      jwtFromRequest: ExtractJwt.fromExtractors([accessTokenFromCookie]),
      secretOrKey: config.jwtAccessSecret,
      ignoreExpiration: false,
    };
    super(options);
  }

  async validate(payload: unknown): Promise<AuthUser> {
    const sub =
      payload !== null && typeof payload === 'object' && 'sub' in payload
        ? (payload as { sub: unknown }).sub
        : null;
    const username =
      payload !== null && typeof payload === 'object' && 'username' in payload
        ? (payload as { username: unknown }).username
        : undefined;
    const iat =
      payload !== null && typeof payload === 'object' && 'iat' in payload
        ? (payload as { iat: unknown }).iat
        : null;
    const exp =
      payload !== null && typeof payload === 'object' && 'exp' in payload
        ? (payload as { exp: unknown }).exp
        : null;
    if (
      typeof sub !== 'string' ||
      (username !== null && typeof username !== 'string') ||
      !Number.isSafeInteger(iat) ||
      !Number.isSafeInteger(exp)
    ) {
      throw new UnauthorizedException();
    }
    const principal = await this.principals.resolve({
      sub,
      username,
      iat: iat as number,
      exp: exp as number,
    } satisfies AccessTokenClaims);
    if (!principal) throw new UnauthorizedException();
    return principal;
  }
}
