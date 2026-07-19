import { z } from 'zod';

import { paginationQuerySchema } from './common';

export const searchTypeSchema = z.enum(['ls', 'users']);
export type SearchType = z.infer<typeof searchTypeSchema>;

export const searchQuerySchema = paginationQuerySchema().extend({
  q: z.string().min(1).max(100),
  type: searchTypeSchema.default('ls'),
}).strict();
export type SearchQuery = z.infer<typeof searchQuerySchema>;
