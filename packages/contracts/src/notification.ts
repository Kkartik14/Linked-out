import { z } from 'zod';

import { ulidSchema, isoTimestampSchema } from './common';
import { notificationTypeSchema } from './enums';
import { userSummarySchema } from './user';

export const notificationSchema = z.object({
  id: ulidSchema,
  type: notificationTypeSchema,
  actor: userSummarySchema.nullable(),
  target: z
    .object({
      lId: ulidSchema,
      title: z.string(),
    })
    .nullable(),
  /** Server-composed, outcome-framed copy. Display verbatim. */
  message: z.string(),
  readAt: isoTimestampSchema.nullable(),
  createdAt: isoTimestampSchema,
});
export type Notification = z.infer<typeof notificationSchema>;

export const unreadCountSchema = z.object({
  /** Capped at 10 because consumers render 9+; this is an indicator, not exact cardinality. */
  count: z.number().int().min(0).max(10),
});
export type UnreadCount = z.infer<typeof unreadCountSchema>;
