import type { Comment } from '@linkedout/contracts';

import { toUserSummary } from '../../common/mappers/user-summary.mapper';
import type { CommentWithMeta } from './comments.repository';

export function toComment(c: CommentWithMeta, viewerId: string | undefined): Comment {
  return {
    id: c.id,
    body: c.body,
    author: toUserSummary(c.author),
    lId: c.lId,
    parentId: c.parentId,
    replyCount: c._count.replies,
    viewer: { canDelete: viewerId === c.authorId },
    createdAt: c.createdAt.toISOString(),
  };
}
