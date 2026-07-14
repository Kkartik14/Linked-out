import { commentPopularityPoints } from '../ls/popularity.policy';

export interface CommentCounterDelta {
  commentCount: number;
  popularityScore: number;
}

export interface CommentNotificationWrite {
  type: 'COMMENT';
  recipientId: string;
  actorId: string;
  lId: string;
  dedupeKey: null;
}

export interface CommentCreatePlan {
  comment: {
    authorId: string;
    lId: string;
    body: string;
    parentId: string | null;
  };
  lCounters: CommentCounterDelta;
  notifications: CommentNotificationWrite[];
}

export interface CommentDeletePlan {
  commentId: string;
  perDeletedCounters: CommentCounterDelta;
}

export function planCommentCreate(input: {
  authorId: string;
  lId: string;
  notificationRecipientIds: string[];
  body: string;
  parentId: string | null;
}): CommentCreatePlan {
  return {
    comment: {
      authorId: input.authorId,
      lId: input.lId,
      body: input.body,
      parentId: input.parentId,
    },
    lCounters: { commentCount: 1, popularityScore: commentPopularityPoints(1) },
    notifications: [...new Set(input.notificationRecipientIds)]
      .filter((recipientId) => recipientId !== input.authorId)
      .map((recipientId) => ({
        type: 'COMMENT',
        recipientId,
        actorId: input.authorId,
        lId: input.lId,
        dedupeKey: null,
      })),
  };
}

export function planCommentDelete(commentId: string): CommentDeletePlan {
  return {
    commentId,
    perDeletedCounters: { commentCount: -1, popularityScore: commentPopularityPoints(-1) },
  };
}
