import { z } from 'zod';

import { ulidSchema, isoTimestampSchema } from './common';
import { lCardSchema } from './l';
import { userSummarySchema } from './user';

export const collectionSchema = z.object({
  id: ulidSchema,
  title: z.string(),
  slug: z.string(),
  owner: userSummarySchema,
  lCount: z.number().int(),
  viewer: z.object({
    canEdit: z.boolean(),
  }),
  createdAt: isoTimestampSchema,
});
export type Collection = z.infer<typeof collectionSchema>;

export const collectionDetailSchema = collectionSchema.extend({
  ls: z.array(lCardSchema),
});
export type CollectionDetail = z.infer<typeof collectionDetailSchema>;

export const createCollectionInputSchema = z.object({
  title: z.string().min(1).max(80),
});
export type CreateCollectionInput = z.infer<typeof createCollectionInputSchema>;

export const updateCollectionInputSchema = z.object({
  title: z.string().min(1).max(80),
});
export type UpdateCollectionInput = z.infer<typeof updateCollectionInputSchema>;

export const addLToCollectionInputSchema = z.object({
  position: z.number().int().min(0).optional(),
});
export type AddLToCollectionInput = z.infer<typeof addLToCollectionInputSchema>;
