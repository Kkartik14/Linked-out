import { z } from 'zod';

import { isoTimestampSchema } from '../common';
import { userProfileSchema, userSummarySchema } from '../user';
import { lCardSchema } from './l';

/** Queryless by design; strict parsing makes stale/unknown client parameters a 400. */
export const feedSidebarQuerySchema = z.object({}).strict();
export type FeedSidebarQuery = z.infer<typeof feedSidebarQuerySchema>;

export const feedSidebarViewerSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('SIGNED_OUT'), profile: z.null() }).strict(),
  z.object({ state: z.literal('ONBOARDING_REQUIRED'), profile: userProfileSchema }).strict(),
  z.object({ state: z.literal('READY'), profile: userProfileSchema }).strict(),
]);
export type FeedSidebarViewer = z.infer<typeof feedSidebarViewerSchema>;

export const suggestionReasonSchema = z.discriminatedUnion('code', [
  z.object({
    code: z.literal('MUTUAL_FOLLOWS'),
    count: z.number().int().positive(),
    text: z.string(),
  }).strict(),
  z.object({ code: z.literal('ACTIVE_BUILDER'), text: z.string() }).strict(),
]);
export type SuggestionReason = z.infer<typeof suggestionReasonSchema>;

export const suggestedUserSchema = z.object({
  user: userSummarySchema,
  reason: suggestionReasonSchema,
  viewer: z.object({ canFollow: z.boolean() }).strict(),
}).strict();
export type SuggestedUser = z.infer<typeof suggestedUserSchema>;

export const interactionWindowSchema = z.object({
  startsAt: isoTimestampSchema,
  endsAt: isoTimestampSchema,
}).strict();
export type InteractionWindow = z.infer<typeof interactionWindowSchema>;

export const featuredLSchema = z.object({
  l: lCardSchema,
  // Positive, not non-negative: the server only features an L after at least one eligible
  // interaction, so 0 is not a quiet edge case — it is a ranking bug.
  interactionCount: z.number().int().positive(),
  interactionLabel: z.string(),
}).strict();
export type FeaturedL = z.infer<typeof featuredLSchema>;

export const attributedFeaturedLSchema = featuredLSchema.extend({
  l: lCardSchema.extend({
    isAnonymous: z.literal(false),
    author: userSummarySchema,
  }),
}).strict();
export type AttributedFeaturedL = z.infer<typeof attributedFeaturedLSchema>;

export const feedSidebarResponseSchema = z.object({
  contractVersion: z.literal(2),
  generatedAt: isoTimestampSchema,
  refreshAfter: isoTimestampSchema,
  viewer: feedSidebarViewerSchema,
  peopleToFollow: z.object({
    personalized: z.boolean(),
    items: z.array(suggestedUserSchema).max(5),
  }).strict(),
  topLs: z.object({
    basis: z.literal('MOST_INTERACTED'),
    window: interactionWindowSchema,
    items: z.array(featuredLSchema).max(5),
  }).strict(),
  lOfTheDay: z
    .object({
      selectedFor: z.iso.date(),
      basis: z.literal('MOST_INTERACTED'),
      window: interactionWindowSchema,
      item: attributedFeaturedLSchema,
    })
    .strict()
    .nullable(),
}).strict();
export type FeedSidebarResponse = z.infer<typeof feedSidebarResponseSchema>;
