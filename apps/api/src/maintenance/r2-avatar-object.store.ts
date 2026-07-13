import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  type S3Client,
} from '@aws-sdk/client-s3';

import {
  AVATAR_PREFIX,
  isAvatarListingCursor,
  isSafeAvatarKey,
  type AvatarObjectPage,
  type AvatarObjectStore,
} from './cleanup.job';

/** R2/S3 adapter. Both list and delete are pinned to the avatar namespace. */
export class R2AvatarObjectStore implements AvatarObjectStore {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {
    if (!bucket) throw new Error('R2_BUCKET is required for avatar cleanup.');
  }

  async listAvatarObjects(
    continuationToken: string | undefined,
    pageSize: number,
    startAfter?: string,
  ): Promise<AvatarObjectPage> {
    if (startAfter !== undefined && !isAvatarListingCursor(startAfter)) {
      throw new Error('R2 avatar listing cursor must remain inside the avatars/ namespace.');
    }
    const response = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: AVATAR_PREFIX,
        ContinuationToken: continuationToken,
        StartAfter: continuationToken === undefined ? startAfter : undefined,
        MaxKeys: pageSize,
      }),
    );
    const nextContinuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
    if (response.IsTruncated && !nextContinuationToken) {
      throw new Error('R2 returned a truncated avatar listing without a continuation token.');
    }

    return {
      objects: (response.Contents ?? []).flatMap((object) =>
        object.Key === undefined
          ? []
          : [{ key: object.Key, lastModified: object.LastModified }],
      ),
      nextContinuationToken,
    };
  }

  async deleteAvatarObjects(keys: readonly string[]): Promise<void> {
    if (keys.length === 0) return;
    if (keys.length > 1000) throw new Error('R2 avatar delete batch cannot exceed 1000 keys.');
    if (!keys.every(isSafeAvatarKey)) {
      throw new Error('Refusing to delete an object outside the avatars/ namespace.');
    }

    const response = await this.client.send(
      new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: {
          Objects: keys.map((Key) => ({ Key })),
          Quiet: true,
        },
      }),
    );
    if ((response.Errors?.length ?? 0) > 0) {
      const failedKeys = response.Errors?.map(({ Key }) => Key ?? '<unknown>').join(', ');
      throw new Error(`R2 failed to delete ${response.Errors?.length} avatar object(s): ${failedKeys}`);
    }
  }
}
