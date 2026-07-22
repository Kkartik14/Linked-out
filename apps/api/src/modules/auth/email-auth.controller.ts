import { Body, Controller, HttpCode, Post, Res, UseGuards } from '@nestjs/common';
import {
  emailLoginInputSchema,
  emailOtpInspectInputSchema,
  emailOtpResendInputSchema,
  emailOtpVerifyInputSchema,
  emailSignupInputSchema,
  forgotPasswordInputSchema,
  resetPasswordInputSchema,
  type EmailAuthHandoffResponse,
  type EmailLoginInput,
  type EmailOtpInspectInput,
  type EmailOtpInspectResponse,
  type EmailOtpRequestAccepted,
  type EmailOtpResendInput,
  type EmailOtpVerifyInput,
  type EmailSignupInput,
  type ForgotPasswordInput,
  type ResetPasswordInput,
} from '@linkedout/contracts';
import type { Response } from 'express';

import { ApiContract, API_ROUTE_CONTRACTS } from '../../common/contracts/api-route-contracts';
import { DEFAULT_PRIVATE_CACHE_CONTROL } from '../../common/http/cache-policy';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { EmailAuthService } from './email-auth.service';
import { EmailOtpInspectionGuard } from './email-otp-inspection.guard';

@Controller('auth/email')
export class EmailAuthController {
  constructor(private readonly emailAuth: EmailAuthService) {}

  @Post('signup')
  @HttpCode(202)
  @ApiContract(API_ROUTE_CONTRACTS.authEmailSignup)
  signup(
    @Body(new ZodValidationPipe(emailSignupInputSchema)) input: EmailSignupInput,
  ): Promise<EmailOtpRequestAccepted> {
    return this.emailAuth.signup(input);
  }

  @Post('verify')
  @HttpCode(200)
  @ApiContract(API_ROUTE_CONTRACTS.authEmailVerify)
  verify(
    @Body(new ZodValidationPipe(emailOtpVerifyInputSchema)) input: EmailOtpVerifyInput,
  ): Promise<EmailAuthHandoffResponse> {
    return this.emailAuth.verify(input);
  }

  @Post('login')
  @HttpCode(200)
  @ApiContract(API_ROUTE_CONTRACTS.authEmailLogin)
  login(
    @Body(new ZodValidationPipe(emailLoginInputSchema)) input: EmailLoginInput,
  ): Promise<EmailAuthHandoffResponse> {
    return this.emailAuth.login(input);
  }

  @Post('resend')
  @HttpCode(202)
  @ApiContract(API_ROUTE_CONTRACTS.authEmailResend)
  resend(
    @Body(new ZodValidationPipe(emailOtpResendInputSchema)) input: EmailOtpResendInput,
  ): Promise<EmailOtpRequestAccepted> {
    return this.emailAuth.resend(input);
  }

  @Post('password/forgot')
  @HttpCode(202)
  @ApiContract(API_ROUTE_CONTRACTS.authEmailPasswordForgot)
  forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordInputSchema)) input: ForgotPasswordInput,
  ): Promise<EmailOtpRequestAccepted> {
    return this.emailAuth.forgotPassword(input);
  }

  @Post('password/reset')
  @HttpCode(200)
  @ApiContract(API_ROUTE_CONTRACTS.authEmailPasswordReset)
  resetPassword(
    @Body(new ZodValidationPipe(resetPasswordInputSchema)) input: ResetPasswordInput,
  ): Promise<{ ok: true }> {
    return this.emailAuth.resetPassword(input);
  }

  @Post('otp/inspect')
  @HttpCode(200)
  @UseGuards(EmailOtpInspectionGuard)
  @ApiContract(API_ROUTE_CONTRACTS.authEmailOtpInspect)
  async inspect(
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodValidationPipe(emailOtpInspectInputSchema)) input: EmailOtpInspectInput,
  ): Promise<EmailOtpInspectResponse> {
    res.setHeader('Cache-Control', DEFAULT_PRIVATE_CACHE_CONTROL);
    return this.emailAuth.inspect(input);
  }
}
