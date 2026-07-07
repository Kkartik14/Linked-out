import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, type StrategyOptionsWithoutRequest } from 'passport-jwt';
import type { Request } from 'express';

import { AppConfigService } from '../../../config/app-config.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { getCookie } from '../../../common/http/cookies';
import type { AuthUser } from '../../../common/types/auth';
import { ACCESS_COOKIE } from '../token.service';

function accessTokenFromCookie(req: Request): string | null {
  return getCookie(req, ACCESS_COOKIE);
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: AppConfigService,
    private readonly prisma: PrismaService,
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
    if (typeof sub !== 'string') {
      throw new UnauthorizedException();
    }
    const user = await this.prisma.db.user.findUnique({
      where: { id: sub },
      select: { id: true, username: true },
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    return { id: user.id, username: user.username };
  }
}
