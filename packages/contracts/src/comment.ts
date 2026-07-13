import { z } from 'zod';

import { ulidSchema, isoTimestampSchema } from './common';
import { userSummarySchema } from './user';

export const commentSchema = z.object({
  id: ulidSchema,
  body: z.string(),
  author: userSummarySchema,
  lId: ulidSchema,
  parentId: ulidSchema.nullable(),
  replyCount: z.number().int(),
  viewer: z.object({
    canDelete: z.boolean(),
  }),
  createdAt: isoTimestampSchema,
});
export type Comment = z.infer<typeof commentSchema>;

export const createCommentInputSchema = z
  .object({
    body: z.string().min(1).max(2000),
  })
  .strict();
export type CreateCommentInput = z.infer<typeof createCommentInputSchema>;
