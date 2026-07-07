import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  avatarUploadRequestSchema,
  type AvatarUploadRequest,
  type AvatarUploadResponse,
} from '@linkedout/contracts';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../common/types/auth';
import { UploadsService } from './uploads.service';

const uploadPipe = new ZodValidationPipe(avatarUploadRequestSchema);

@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post('avatar')
  avatar(
    @CurrentUser() user: AuthUser,
    @Body(uploadPipe) body: AvatarUploadRequest,
  ): Promise<AvatarUploadResponse> {
    return this.uploads.createAvatarUpload(user.id, body);
  }
}
