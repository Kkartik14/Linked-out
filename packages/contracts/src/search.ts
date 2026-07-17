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
}).superRefine((query, ctx) => {
  if (query.type === 'users' && query.filter !== undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['filter'],
      message: 'filter is only valid when type=ls',
    });
  }
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;
