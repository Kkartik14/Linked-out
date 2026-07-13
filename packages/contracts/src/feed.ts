import { z } from 'zod';

import { paginationQuerySchema } from './common';
import type { LCategory } from './enums';
import { lTypeSchema } from './enums';

export const feedSortSchema = z.enum(['latest', 'popular', 'helpful']);
export type FeedSort = z.infer<typeof feedSortSchema>;

/** Feed/search category filter is lowercase on the wire (contract.md §4.4). */
export const feedFilterSchema = z.enum([
  'interviews',
  'startups',
  'layoffs',
  'production',
  'career',
  'learning',
]);
export type FeedFilter = z.infer<typeof feedFilterSchema>;

/** Maps the lowercase wire filter to the Prisma LCategory enum. */
export const FEED_FILTER_TO_CATEGORY: Record<FeedFilter, LCategory> = {
  interviews: 'INTERVIEWS',
  startups: 'STARTUPS',
  layoffs: 'LAYOFFS',
  production: 'PRODUCTION',
  career: 'CAREER',
  learning: 'LEARNING',
};

export const feedQuerySchema = paginationQuerySchema().extend({
  sort: feedSortSchema.default('latest'),
  filter: feedFilterSchema.optional(),
});
export type FeedQuery = z.infer<typeof feedQuerySchema>;

/** GET /users/:username/ls — optional profile-section filter by type. */
export const userLsQuerySchema = paginationQuerySchema().extend({
  type: lTypeSchema.optional(),
});
export type UserLsQuery = z.infer<typeof userLsQuerySchema>;

/** GET /users/:username/journey — larger pages, oldest→newest. */
export const journeyQuerySchema = paginationQuerySchema({ defaultLimit: 30, maxLimit: 100 });
export type JourneyQuery = z.infer<typeof journeyQuerySchema>;
