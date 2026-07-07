import { z } from 'zod';

export const AVATAR_MAX_BYTES = 5_242_880; // 5 MB

export const avatarContentTypeSchema = z.enum(['image/jpeg', 'image/png', 'image/webp']);
export type AvatarContentType = z.infer<typeof avatarContentTypeSchema>;

export const avatarUploadRequestSchema = z.object({
  contentType: avatarContentTypeSchema,
  contentLength: z.number().int().min(1).max(AVATAR_MAX_BYTES),
});
export type AvatarUploadRequest = z.infer<typeof avatarUploadRequestSchema>;

export const avatarUploadResponseSchema = z.object({
  uploadUrl: z.string(),
  publicUrl: z.string(),
  /** Headers the client MUST replay on the PUT (esp. Content-Type). */
  headers: z.record(z.string(), z.string()),
  expiresIn: z.number().int(),
});
export type AvatarUploadResponse = z.infer<typeof avatarUploadResponseSchema>;
