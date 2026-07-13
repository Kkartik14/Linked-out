import { commentPopularityPoints } from '../ls/popularity.policy';

export interface CommentCounterDelta {
  commentCount: number;
  popularityScore: number;
}

export interface InsertCommentNotificationPlan {
  action: 'insert';
  record: {
    type: 'COMMENT';
    recipientId: string;
    actorId: string;
    lId: string;
    dedupeKey: null;
  };
}

export interface CommentCreatePlan {
  comment: {
    authorId: string;
    lId: string;
    body: string;
    parentId: string | null;
  };
  lCounters: CommentCounterDelta;
  notification: InsertCommentNotificationPlan | null;
}

export interface CommentDeletePlan {
  commentId: string;
  perDeletedCounters: CommentCounterDelta;
}

export function planCommentCreate(input: {
  authorId: string;
  lId: string;
  lAuthorId: string;
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
    notification:
      input.authorId === input.lAuthorId
        ? null
        : {
            action: 'insert',
            record: {
              type: 'COMMENT',
              recipientId: input.lAuthorId,
              actorId: input.authorId,
              lId: input.lId,
              dedupeKey: null,
            },
          },
  };
}

export function planCommentDelete(commentId: string): CommentDeletePlan {
  return {
    commentId,
    perDeletedCounters: { commentCount: -1, popularityScore: commentPopularityPoints(-1) },
  };
}
