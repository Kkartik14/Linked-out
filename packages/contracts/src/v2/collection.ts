import { z } from 'zod';

import { isoTimestampSchema, ulidSchema } from '../common';
import { userSummarySchema } from '../user';
import { lCardSchema } from './l';

export const collectionSchema = z.object({
  id: ulidSchema,
  title: z.string(),
  slug: z.string(),
  owner: userSummarySchema,
  lCount: z.number().int(),
  viewer: z.object({ canEdit: z.boolean() }),
  createdAt: isoTimestampSchema,
});
export type Collection = z.infer<typeof collectionSchema>;

export const collectionDetailSchema = collectionSchema.extend({
  ls: z.array(lCardSchema),
});
export type CollectionDetail = z.infer<typeof collectionDetailSchema>;
