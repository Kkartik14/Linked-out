import { Injectable } from '@nestjs/common';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ulid } from 'ulid';
import type {
  AvatarContentType,
  AvatarUploadRequest,
  AvatarUploadResponse,
} from '@linkedout/contracts';

import { AppConfigService } from '../../config/app-config.service';
import { AppErrors } from '../../common/errors/app-exception';

const EXTENSION: Readonly<Record<AvatarContentType, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const EXPIRES_IN_SECONDS = 300;

@Injectable()
export class UploadsService {
  private readonly client: S3Client | null;

  constructor(private readonly config: AppConfigService) {
    const r2 = config.r2;
    this.client = r2.configured
      ? new S3Client({
          region: 'auto',
          endpoint: r2.endpoint,
          credentials: { accessKeyId: r2.accessKeyId, secretAccessKey: r2.secretAccessKey },
        })
      : null;
  }

  async createAvatarUpload(
    userId: string,
    input: AvatarUploadRequest,
  ): Promise<AvatarUploadResponse> {
    if (!this.client) throw AppErrors.uploadsDisabled();
    const r2 = this.config.r2;
    const key = `avatars/${userId}/${ulid()}.${EXTENSION[input.contentType]}`;
    const command = new PutObjectCommand({
      Bucket: r2.bucket,
      Key: key,
      ContentType: input.contentType,
    });
    const uploadUrl = await getSignedUrl(this.client, command, { expiresIn: EXPIRES_IN_SECONDS });
    const publicUrl = `${r2.publicBaseUrl.replace(/\/+$/, '')}/${key}`;
    return {
      uploadUrl,
      publicUrl,
      headers: { 'Content-Type': input.contentType },
      expiresIn: EXPIRES_IN_SECONDS,
    };
  }
}
