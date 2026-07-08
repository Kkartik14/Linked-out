import { Module, type Provider } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { AppConfigService } from '../../config/app-config.service';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { GithubStrategy } from './strategies/github.strategy';

// Register each OAuth strategy only when its credentials exist. Passport registers a
// strategy as a side effect of construction, so skipping construction leaves the provider
// truly absent — the guard turns an unconfigured provider into a clean 503.
const googleStrategyProvider: Provider = {
  provide: GoogleStrategy,
  useFactory: (config: AppConfigService, auth: AuthService): GoogleStrategy | null =>
    config.google.configured ? new GoogleStrategy(config, auth) : null,
  inject: [AppConfigService, AuthService],
};

const githubStrategyProvider: Provider = {
  provide: GithubStrategy,
  useFactory: (config: AppConfigService, auth: AuthService): GithubStrategy | null =>
    config.github.configured ? new GithubStrategy(config, auth) : null,
  inject: [AppConfigService, AuthService],
};

@Module({
  imports: [PassportModule, JwtModule.register({}), UsersModule],
  controllers: [AuthController],
  providers: [
    AuthRepository,
    AuthService,
    TokenService,
    JwtStrategy,
    googleStrategyProvider,
    githubStrategyProvider,
  ],
})
export class AuthModule {}
