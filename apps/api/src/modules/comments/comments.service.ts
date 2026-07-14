import { Injectable } from '@nestjs/common';
import type {
  Comment,
  CreateCommentInput,
  Paginated,
  PaginationQuery,
} from '@linkedout/contracts';

import { AppErrors } from '../../common/errors/app-exception';
import { decodeCursorId } from '../../common/pagination/cursor';
import { mapPage } from '../../common/pagination/paginate';
import type { AuthUser } from '../../common/types/auth';
import { LsService } from '../ls/ls.service';
import { CommentsRepository } from './comments.repository';
import { planCommentCreate, planCommentDelete } from './comments.plan';
import { toComment } from './comments.mapper';

@Injectable()
export class CommentsService {
  constructor(
    private readonly repo: CommentsRepository,
    private readonly ls: LsService,
  ) {}

  async createOnL(user: AuthUser, lId: string, input: CreateCommentInput): Promise<Comment> {
    if (!user.username) throw AppErrors.onboardingRequired();
    const l = await this.ls.getViewableL(lId, user.id);
    const comment = await this.repo.create(
      planCommentCreate({
        authorId: user.id,
        lId,
        notificationRecipientId: l.authorId,
        body: input.body,
        parentId: null,
      }),
    );
    if (!comment) throw AppErrors.lNotFound();
    return toComment(comment, user.id);
  }

  async createReply(
    user: AuthUser,
    parentCommentId: string,
    input: CreateCommentInput,
  ): Promise<Comment> {
    if (!user.username) throw AppErrors.onboardingRequired();
    const parent = await this.repo.findMeta(parentCommentId);
    if (!parent) throw AppErrors.commentNotFound();
    if (parent.parentId !== null) {
      throw AppErrors.validationMessage('Replies can only be added to top-level comments.');
    }
    await this.ls.getViewableL(parent.lId, user.id);
    const comment = await this.repo.create(
      planCommentCreate({
        authorId: user.id,
        lId: parent.lId,
        notificationRecipientId: parent.authorId,
        body: input.body,
        parentId: parent.id,
      }),
    );
    if (!comment) throw AppErrors.commentNotFound();
    return toComment(comment, user.id);
  }

  async listForL(
    lId: string,
    query: PaginationQuery,
    viewerId: string | undefined,
  ): Promise<Paginated<Comment>> {
    await this.ls.getViewableL(lId, viewerId);
    const page = await this.repo.listTopLevel(lId, query.limit, decodeCursorId(query.cursor));
    return mapPage(page, (row) => toComment(row, viewerId));
  }

  async listReplies(
    commentId: string,
    query: PaginationQuery,
    viewerId: string | undefined,
  ): Promise<Paginated<Comment>> {
    const parent = await this.repo.findMeta(commentId);
    if (!parent) throw AppErrors.commentNotFound();
    await this.ls.getViewableL(parent.lId, viewerId);
    const page = await this.repo.listReplies(commentId, query.limit, decodeCursorId(query.cursor));
    return mapPage(page, (row) => toComment(row, viewerId));
  }

  async remove(user: AuthUser, commentId: string): Promise<{ ok: true }> {
    const comment = await this.repo.findMeta(commentId);
    if (!comment) throw AppErrors.commentNotFound();
    if (comment.authorId !== user.id) {
      throw AppErrors.forbidden('You can only delete your own comment.');
    }
    await this.repo.delete(planCommentDelete(commentId));
    return { ok: true };
  }
}
