import { z } from 'zod';

import {
  lTypeSchema,
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
  visibility: z.array(
    z.object({ value: visibilitySchema, label: z.string(), description: z.string() }),
  ),
  notificationType: z.array(z.object({ value: notificationTypeSchema, label: z.string() })),
  reputation: z.array(z.object({ key: z.string(), label: z.string() })),
});
export type MetaEnumsResponse = z.infer<typeof metaEnumsResponseSchema>;
