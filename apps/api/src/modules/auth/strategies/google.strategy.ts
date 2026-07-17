import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile, type StrategyOptions } from 'passport-google-oauth20';

import { AppConfigService } from '../../../config/app-config.service';
import type { AuthUser } from '../../../common/types/auth';
import { AuthService } from '../auth.service';
import { normalizeGoogleProfile } from '../oauth-profile';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    config: AppConfigService,
    private readonly auth: AuthService,
  ) {
    const options: StrategyOptions = {
      clientID: config.google.clientId,
      clientSecret: config.google.clientSecret,
      callbackURL: `${config.oauthCallbackBaseUrl}/v1/auth/google/callback`,
      scope: ['email', 'profile'],
    };
    super(options);
  }

  validate(_accessToken: string, _refreshToken: string, profile: Profile): Promise<AuthUser> {
    return this.auth.validateOAuthLogin(normalizeGoogleProfile(profile));
  }
}
