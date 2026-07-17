import { Global, Module, type Provider } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { AppConfigService } from '../../config/app-config.service';
import { REQUEST_AUTHENTICATION } from '../../common/auth/request-authentication';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalAuthGuard } from '../../common/guards/optional-auth.guard';
import { StrictOptionalAuthGuard } from '../../common/guards/strict-optional-auth.guard';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AccessPrincipalResolver } from './access-principal.resolver';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { TokenModule } from './token.module';
import { NestRequestAuthentication } from './nest-request-authentication';
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

@Global()
@Module({
  imports: [PassportModule, TokenModule, UsersModule],
  controllers: [AuthController],
  providers: [
    AuthRepository,
    AccessPrincipalResolver,
    NestRequestAuthentication,
    { provide: REQUEST_AUTHENTICATION, useExisting: NestRequestAuthentication },
    JwtAuthGuard,
    OptionalAuthGuard,
    StrictOptionalAuthGuard,
    AuthService,
    JwtStrategy,
    googleStrategyProvider,
    githubStrategyProvider,
  ],
  exports: [JwtAuthGuard, OptionalAuthGuard, StrictOptionalAuthGuard, REQUEST_AUTHENTICATION],
})
export class AuthModule {}
