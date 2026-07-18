import { z } from 'zod';

import {
  ulidSchema,
  isoTimestampSchema,
  dateInputSchema,
  AT_LEAST_ONE_FIELD,
  hasAtLeastOneField,
} from './common';
import { lTypeSchema, visibilitySchema, reactionTypeSchema } from './enums';
import { reactionsSummarySchema } from './reaction';
import { userSummarySchema } from './user';

/** Lightweight reference to a collection an L belongs to (embedded in LDetail). */
export const collectionRefSchema = z.object({
  id: ulidSchema,
  title: z.string(),
  slug: z.string(),
});
export type CollectionRef = z.infer<typeof collectionRefSchema>;

const lViewerSchema = z
  .object({
    reactions: z.array(reactionTypeSchema),
    canEdit: z.boolean(),
  })
  .strict();

/** Fields shared by LCard and LDetail. `author` is null when isAnonymous. */
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
}).strict();

/** An L as it appears in feeds and lists (truncated body). */
export const lCardSchema = lCoreSchema.extend({
  storyPreview: z.string(),
});
export type LCard = z.infer<typeof lCardSchema>;

/** A single L (full body + collections). */
export const lDetailSchema = lCoreSchema.extend({
  story: z.string(),
  collections: z.array(collectionRefSchema),
});
export type LDetail = z.infer<typeof lDetailSchema>;

/** One node on the L Journey timeline. */
export const journeyNodeSchema = z.object({
  id: ulidSchema,
  title: z.string(),
  type: lTypeSchema,
  createdAt: isoTimestampSchema,
  isAnonymous: z.boolean(),
  resolvedAt: isoTimestampSchema.nullable(),
  reactionTotal: z.number().int(),
  commentCount: z.number().int(),
}).strict();
export type JourneyNode = z.infer<typeof journeyNodeSchema>;

// ─── Inputs ────────────────────────────────────────────────────────────────────

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

/** PATCH /ls/:id — every field optional; `resolvedAt` toggles a Battle's resolved state. */
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
