import { z } from 'zod';

import {
  AT_LEAST_ONE_FIELD,
  dateInputSchema,
  hasAtLeastOneField,
  isoTimestampSchema,
  ulidSchema,
} from '../common';
import { lTypeSchema, reactionTypeSchema, visibilitySchema } from '../enums';
import { reactionsSummarySchema } from '../reaction';
import { userSummarySchema } from '../user';

export const collectionRefSchema = z.object({
  id: ulidSchema,
  title: z.string(),
  slug: z.string(),
});
export type CollectionRef = z.infer<typeof collectionRefSchema>;

const lViewerSchema = z.object({
  reactions: z.array(reactionTypeSchema),
  canEdit: z.boolean(),
});

/** V2 L wire core. Legacy category/company/tags/eventDate fields do not exist in v2. */
const lCoreSchema = z.object({
  id: ulidSchema,
  title: z.string(),
  type: lTypeSchema,
  visibility: visibilitySchema,
  isAnonymous: z.boolean(),
  resolvedAt: isoTimestampSchema.nullable(),
  author: userSummarySchema.nullable(),
  reactions: reactionsSummarySchema,
  commentCount: z.number().int(),
  viewer: lViewerSchema,
  createdAt: isoTimestampSchema,
});

export const lCardSchema = lCoreSchema.extend({
  storyPreview: z.string(),
});
export type LCard = z.infer<typeof lCardSchema>;

export const lDetailSchema = lCoreSchema.extend({
  story: z.string(),
  collections: z.array(collectionRefSchema),
});
export type LDetail = z.infer<typeof lDetailSchema>;

/** V2 journeys use the publication timestamp and order by createdAt, then id. */
export const journeyNodeSchema = z.object({
  id: ulidSchema,
  title: z.string(),
  type: lTypeSchema,
  createdAt: isoTimestampSchema,
  isAnonymous: z.boolean(),
  resolvedAt: isoTimestampSchema.nullable(),
  reactionTotal: z.number().int(),
  commentCount: z.number().int(),
});
export type JourneyNode = z.infer<typeof journeyNodeSchema>;

export const createLInputSchema = z
  .object({
    title: z.string().min(1).max(140),
    story: z.string().min(1).max(10_000),
    type: lTypeSchema.default('L'),
    visibility: visibilitySchema.default('PUBLIC'),
    isAnonymous: z.boolean().default(false),
  })
  .strict();
export type CreateLInput = z.infer<typeof createLInputSchema>;

export const updateLInputSchema = z
  .object({
    title: z.string().min(1).max(140),
    story: z.string().min(1).max(10_000),
    type: lTypeSchema,
    visibility: visibilitySchema,
    isAnonymous: z.boolean(),
    resolvedAt: dateInputSchema.nullable(),
  })
  .partial()
  .strict()
  .refine(hasAtLeastOneField, { message: AT_LEAST_ONE_FIELD });
export type UpdateLInput = z.infer<typeof updateLInputSchema>;
