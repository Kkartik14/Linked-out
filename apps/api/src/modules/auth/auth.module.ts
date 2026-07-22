import { Global, Module, type Provider } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { AppConfigService } from '../../config/app-config.service';
import { REQUEST_AUTHENTICATION } from '../../common/auth/request-authentication';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalAuthGuard } from '../../common/guards/optional-auth.guard';
import { UsersModule } from '../users/users.module';
import {
  BrowserSessionAuthority,
  PrismaBrowserSessionPersistence,
} from '@linkedout/session-authority';
import { ApiAssertionSigner } from '@linkedout/internal-auth';

import { PrismaService } from '../../prisma/prisma.service';
import { AuthController } from './auth.controller';
import { EmailAuthController } from './email-auth.controller';
import { BffCallerGuard } from './bff-caller.guard';
import { API_ASSERTION_SIGNER, BffSessionService } from './bff-session.service';
import { AccessPrincipalResolver } from './access-principal.resolver';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { OAuthHandoffRepository } from './oauth-handoff.repository';
import { OAuthHandoffService } from './oauth-handoff.service';
import { TokenModule } from './token.module';
import { NestRequestAuthentication } from './nest-request-authentication';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { GithubStrategy } from './strategies/github.strategy';
import { EmailAuthRepository } from './email-auth.repository';
import { EmailOtpCrypto } from './email-otp.crypto';
import { PasswordHasher } from './password-hasher';
import { EmailAuthRateLimiter } from './email-auth-rate-limiter';
import { EmailAuthService } from './email-auth.service';
import { EMAIL_OTP_DELIVERY, StubEmailOtpDelivery } from './email-otp.delivery';
import { EmailOtpInspectionGuard } from './email-otp-inspection.guard';
import {
  PasswordSafetyService,
  PWNED_PASSWORDS_FETCH,
  PwnedPasswordsClient,
} from './password-safety.service';

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
  controllers: [AuthController, EmailAuthController],
  providers: [
    AuthRepository,
    OAuthHandoffRepository,
    OAuthHandoffService,
    EmailAuthRepository,
    EmailOtpCrypto,
    PasswordHasher,
    PasswordSafetyService,
    PwnedPasswordsClient,
    { provide: PWNED_PASSWORDS_FETCH, useValue: globalThis.fetch.bind(globalThis) },
    EmailAuthRateLimiter,
    EmailAuthService,
    EmailOtpInspectionGuard,
    StubEmailOtpDelivery,
    { provide: EMAIL_OTP_DELIVERY, useExisting: StubEmailOtpDelivery },
    // Policy depends on a persistence seam; only the Prisma adapter sees the database client.
    {
      provide: BrowserSessionAuthority,
      useFactory: (prisma: PrismaService) =>
        new BrowserSessionAuthority(new PrismaBrowserSessionPersistence(prisma.db)),
      inject: [PrismaService],
    },
    {
      provide: API_ASSERTION_SIGNER,
      useFactory: (config: AppConfigService): ApiAssertionSigner | null =>
        config.internalApiSecret ? new ApiAssertionSigner(config.internalApiSecret) : null,
      inject: [AppConfigService],
    },
    BffSessionService,
    BffCallerGuard,
    AccessPrincipalResolver,
    NestRequestAuthentication,
    { provide: REQUEST_AUTHENTICATION, useExisting: NestRequestAuthentication },
    JwtAuthGuard,
    OptionalAuthGuard,
    AuthService,
    JwtStrategy,
    googleStrategyProvider,
    githubStrategyProvider,
  ],
  exports: [JwtAuthGuard, OptionalAuthGuard, REQUEST_AUTHENTICATION],
})
export class AuthModule {}
