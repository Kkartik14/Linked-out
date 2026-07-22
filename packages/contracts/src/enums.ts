import { z } from 'zod';
import type { ReputationKey } from './reputation';

// ─── Enum schemas (string values mirror the Prisma enums in @linkedout/db) ─────

export const lTypeSchema = z.enum([
  'L',
  'WIN',
  'STORY',
  'SCAR',
  'PLOT_TWIST',
  'CHECKPOINT',
  'BATTLE',
  'LESSON',
]);
export type LType = z.infer<typeof lTypeSchema>;

export const visibilitySchema = z.enum(['PUBLIC', 'FOLLOWERS', 'PRIVATE']);
export type Visibility = z.infer<typeof visibilitySchema>;

export const reactionTypeSchema = z.enum([
  'BEEN_THERE',
  'HELPFUL',
  'RESPECT',
  'PAIN',
  'SAVED',
]);
export type ReactionType = z.infer<typeof reactionTypeSchema>;

export const journeyStatusSchema = z.enum([
  'INTERVIEWING',
  'BUILDING',
  'WORKING',
  'STARTING_UP',
  'RECOVERING',
  'TAKING_A_BREAK',
]);
export type JourneyStatus = z.infer<typeof journeyStatusSchema>;

export const notificationTypeSchema = z.enum([
  'RELATED',
  'HELPED',
  'NEW_FOLLOWER',
  'COMMENT',
]);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

// ─── Display metadata (single source of truth; served by GET /meta/enums) ──────

export interface LTypeMeta {
  value: LType;
  label: string;
  sectionLabel: string;
}
export interface VisibilityMeta {
  value: Visibility;
  label: string;
  description: string;
}
export interface ReactionTypeMeta {
  value: ReactionType;
  label: string;
  emoji: string;
}
export interface JourneyStatusMeta {
  value: JourneyStatus;
  label: string;
  dot: string;
}
export interface NotificationTypeMeta {
  value: NotificationType;
  label: string;
}
export interface ReputationMeta {
  key: ReputationKey;
  label: string;
}

export const L_TYPE_META: readonly LTypeMeta[] = [
  { value: 'L', label: 'L', sectionLabel: 'Ls' },
  { value: 'WIN', label: 'Win', sectionLabel: 'Wins' },
  { value: 'STORY', label: 'Story', sectionLabel: 'Stories' },
  { value: 'SCAR', label: 'Scar', sectionLabel: 'Scars' },
  { value: 'PLOT_TWIST', label: 'Plot Twist', sectionLabel: 'Plot Twists' },
  { value: 'CHECKPOINT', label: 'Checkpoint', sectionLabel: 'Checkpoints' },
  { value: 'BATTLE', label: 'Battle', sectionLabel: 'Battles' },
  { value: 'LESSON', label: 'Lesson', sectionLabel: 'Character Development' },
];

export const VISIBILITY_META: readonly VisibilityMeta[] = [
  { value: 'PUBLIC', label: 'Public', description: 'Anyone can see this' },
  { value: 'FOLLOWERS', label: 'Followers', description: 'Only people who follow you' },
  { value: 'PRIVATE', label: 'Private', description: 'Only you' },
];

export const REACTION_TYPE_META: readonly ReactionTypeMeta[] = [
  { value: 'BEEN_THERE', label: 'Been There', emoji: '💔' },
  { value: 'HELPFUL', label: 'Helpful', emoji: '💡' },
  { value: 'RESPECT', label: 'Respect', emoji: '🔥' },
  { value: 'PAIN', label: 'Pain', emoji: '😂' },
  { value: 'SAVED', label: 'Saved', emoji: '📌' },
];

export const JOURNEY_STATUS_META: readonly JourneyStatusMeta[] = [
  { value: 'INTERVIEWING', label: 'Interviewing', dot: '🟡' },
  { value: 'BUILDING', label: 'Building', dot: '🔵' },
  { value: 'WORKING', label: 'Working', dot: '🟢' },
  { value: 'STARTING_UP', label: 'Starting Up', dot: '🟣' },
  { value: 'RECOVERING', label: 'Recovering', dot: '🔴' },
  { value: 'TAKING_A_BREAK', label: 'Taking a Break', dot: '⚫' },
];

export const NOTIFICATION_TYPE_META: readonly NotificationTypeMeta[] = [
  { value: 'RELATED', label: 'Related' },
  { value: 'HELPED', label: 'Helped' },
  { value: 'NEW_FOLLOWER', label: 'New Follower' },
  { value: 'COMMENT', label: 'Comment' },
];

export const REPUTATION_META: readonly ReputationMeta[] = [
  { key: 'storiesShared', label: 'Stories Shared' },
  { key: 'lessonsShared', label: 'Lessons Shared' },
  { key: 'lsShared', label: 'Ls Shared' },
];
