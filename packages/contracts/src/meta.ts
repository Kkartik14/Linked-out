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

export const operationalComponentSchema = z.enum([
  'private-api',
  'database',
  'session-authority',
]);
export type OperationalComponent = z.infer<typeof operationalComponentSchema>;

export const operationalHealthResponseSchema = z.object({
  status: z.literal('ok'),
  component: operationalComponentSchema,
});
export type OperationalHealthResponse = z.infer<typeof operationalHealthResponseSchema>;
