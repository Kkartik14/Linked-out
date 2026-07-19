import { z } from 'zod';

import { paginationQuerySchema } from './common';
import { lTypeSchema } from './enums';

export const feedSortSchema = z.enum(['latest', 'popular', 'helpful']);
export type FeedSort = z.infer<typeof feedSortSchema>;

export const feedQuerySchema = paginationQuerySchema()
  .extend({ sort: feedSortSchema.default('latest') })
  .strict();
export type FeedQuery = z.infer<typeof feedQuerySchema>;

/** GET /users/:username/ls — optional profile-section filter by type. */
export const userLsQuerySchema = paginationQuerySchema()
  .extend({ type: lTypeSchema.optional() })
  .strict();
export type UserLsQuery = z.infer<typeof userLsQuerySchema>;

/** GET /users/:username/journey — larger pages, oldest→newest. */
export const journeyQuerySchema = paginationQuerySchema({ defaultLimit: 30, maxLimit: 100 }).strict();
export type JourneyQuery = z.infer<typeof journeyQuerySchema>;
