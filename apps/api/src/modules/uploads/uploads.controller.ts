import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  type AvatarUploadRequest,
  type AvatarUploadResponse,
} from '@linkedout/contracts';

import { ApiContract, API_ROUTE_CONTRACTS } from '../../common/contracts/api-route-contracts';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../common/types/auth';
import { UploadsService } from './uploads.service';

const uploadPipe = new ZodValidationPipe(API_ROUTE_CONTRACTS.avatarUpload.body.schema);

@Controller({ path: 'uploads', version: ['1', '2'] })
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post('avatar')
  @HttpCode(200)
  @ApiContract(API_ROUTE_CONTRACTS.avatarUpload)
  avatar(
    @CurrentUser() user: AuthUser,
    @Body(uploadPipe) body: AvatarUploadRequest,
  ): Promise<AvatarUploadResponse> {
    return this.uploads.createAvatarUpload(user.id, body);
  }
}
