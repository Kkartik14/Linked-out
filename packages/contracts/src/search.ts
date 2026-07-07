import { z } from 'zod';

import { paginationQuerySchema } from './common';
import { feedFilterSchema } from './feed';

export const searchTypeSchema = z.enum(['ls', 'users']);
export type SearchType = z.infer<typeof searchTypeSchema>;

export const searchQuerySchema = paginationQuerySchema().extend({
  q: z.string().min(1).max(100),
  type: searchTypeSchema.default('ls'),
  /** Category filter — only applies when type=ls. */
  filter: feedFilterSchema.optional(),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;
