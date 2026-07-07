import { z } from 'zod';

import {
  lTypeSchema,
  lCategorySchema,
  visibilitySchema,
  reactionTypeSchema,
  journeyStatusSchema,
  notificationTypeSchema,
} from './enums';

export const metaEnumsResponseSchema = z.object({
  reactionType: z.array(
    z.object({ value: reactionTypeSchema, label: z.string(), emoji: z.string() }),
  ),
  journeyStatus: z.array(
    z.object({ value: journeyStatusSchema, label: z.string(), dot: z.string() }),
  ),
  lType: z.array(
    z.object({ value: lTypeSchema, label: z.string(), sectionLabel: z.string() }),
  ),
  lCategory: z.array(z.object({ value: lCategorySchema, label: z.string() })),
  visibility: z.array(
    z.object({ value: visibilitySchema, label: z.string(), description: z.string() }),
  ),
  notificationType: z.array(z.object({ value: notificationTypeSchema, label: z.string() })),
  reputation: z.array(z.object({ key: z.string(), label: z.string() })),
});
export type MetaEnumsResponse = z.infer<typeof metaEnumsResponseSchema>;

export const popularTagsQuerySchema = z.object({
  q: z.string().max(30).optional(),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});
export type PopularTagsQuery = z.infer<typeof popularTagsQuerySchema>;

export const popularTagsResponseSchema = z.object({
  tags: z.array(z.object({ tag: z.string(), count: z.number().int() })),
});
export type PopularTagsResponse = z.infer<typeof popularTagsResponseSchema>;
