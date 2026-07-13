import type { NotificationType, ReactionType } from '@linkedout/contracts';

import { reactionPopularityDelta } from '../ls/popularity.policy';
import { foldedReactionKey, reactionNotificationType } from '../notifications/notification-events';

export interface ReactionCounterDelta {
  reactionCount: number;
  beenThereCount?: number;
  helpfulCount?: number;
  respectCount?: number;
  painCount?: number;
  savedCount?: number;
  popularityScore?: number;
}

export interface BuilderReputationDelta {
  userId: string;
  buildersHelped: number;
}

export interface FoldedNotificationRecord {
  type: NotificationType;
  recipientId: string;
  actorId: string;
  lId: string;
  dedupeKey: string;
}

export interface UpsertFoldedNotificationPlan {
  action: 'upsert_folded';
  record: FoldedNotificationRecord;
}

export interface DeleteFoldedNotificationPlan {
  action: 'delete_fold_if_no_external_reaction';
  dedupeKey: string;
  recipientId: string;
  lId: string;
  reactionType: ReactionType;
}

export interface ReactionAddPlan {
  reaction: { userId: string; lId: string; type: ReactionType };
  lCounters: ReactionCounterDelta;
  reputation: BuilderReputationDelta | null;
  notification: UpsertFoldedNotificationPlan | null;
}

export interface ReactionRemovePlan {
  reaction: { userId: string; lId: string; type: ReactionType };
  lCounters: ReactionCounterDelta;
  reputation: BuilderReputationDelta | null;
  notification: DeleteFoldedNotificationPlan | null;
}

function reactionCounters(type: ReactionType, sign: 1 | -1): ReactionCounterDelta {
  const popularityScore = reactionPopularityDelta(type, sign);
  const ranked = popularityScore === 0 ? {} : { popularityScore };
  switch (type) {
    case 'BEEN_THERE':
      return { reactionCount: sign, beenThereCount: sign, ...ranked };
    case 'HELPFUL':
      return { reactionCount: sign, helpfulCount: sign, ...ranked };
    case 'RESPECT':
      return { reactionCount: sign, respectCount: sign, ...ranked };
    case 'PAIN':
      return { reactionCount: sign, painCount: sign, ...ranked };
    case 'SAVED':
      return { reactionCount: sign, savedCount: sign };
  }
}

function reputation(
  actorId: string,
  authorId: string,
  type: ReactionType,
  sign: 1 | -1,
): BuilderReputationDelta | null {
  return type === 'HELPFUL' && actorId !== authorId
    ? { userId: authorId, buildersHelped: sign }
    : null;
}

function notificationIdentity(
  actorId: string,
  lId: string,
  type: ReactionType,
  authorId: string,
): FoldedNotificationRecord | null {
  if (actorId === authorId) return null;
  const notificationType = reactionNotificationType(type);
  return notificationType
    ? {
        type: notificationType,
        recipientId: authorId,
        actorId,
        lId,
        dedupeKey: foldedReactionKey(authorId, lId, notificationType),
      }
    : null;
}

export function planReactionAdd(
  actorId: string,
  lId: string,
  type: ReactionType,
  authorId: string,
): ReactionAddPlan {
  const notification = notificationIdentity(actorId, lId, type, authorId);
  return {
    reaction: { userId: actorId, lId, type },
    lCounters: reactionCounters(type, 1),
    reputation: reputation(actorId, authorId, type, 1),
    notification: notification ? { action: 'upsert_folded', record: notification } : null,
  };
}

export function planReactionRemove(
  actorId: string,
  lId: string,
  type: ReactionType,
  authorId: string,
): ReactionRemovePlan {
  const notification = notificationIdentity(actorId, lId, type, authorId);
  return {
    reaction: { userId: actorId, lId, type },
    lCounters: reactionCounters(type, -1),
    reputation: reputation(actorId, authorId, type, -1),
    notification: notification
      ? {
          action: 'delete_fold_if_no_external_reaction',
          dedupeKey: notification.dedupeKey,
          recipientId: authorId,
          lId,
          reactionType: type,
        }
      : null,
  };
}
