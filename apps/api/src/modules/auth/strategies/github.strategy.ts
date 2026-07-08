import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile, type StrategyOptions } from 'passport-github2';

import { AppConfigService } from '../../../config/app-config.service';
import type { AuthUser } from '../../../common/types/auth';
import { AuthService } from '../auth.service';
import { normalizeGithubProfile } from '../oauth-profile';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(
    config: AppConfigService,
    private readonly auth: AuthService,
  ) {
    const options: StrategyOptions = {
      clientID: config.github.clientId,
      clientSecret: config.github.clientSecret,
      callbackURL: `${config.apiBaseUrl}/v1/auth/github/callback`,
      scope: ['user:email'],
    };
    super(options);
  }

  validate(_accessToken: string, _refreshToken: string, profile: Profile): Promise<AuthUser> {
    return this.auth.validateOAuthLogin(normalizeGithubProfile(profile));
  }
}
