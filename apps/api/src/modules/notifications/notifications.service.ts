import { Injectable } from '@nestjs/common';
import type {
  Notification,
  Paginated,
  PaginationQuery,
  ReactionType,
  UnreadCount,
} from '@linkedout/contracts';
import type { NotificationType } from '@linkedout/db';

import { decodeCursorId } from '../../common/pagination/cursor';
import { mapPage } from '../../common/pagination/paginate';
import { NotificationsRepository } from './notifications.repository';
import { toNotification } from './notifications.mapper';

function reactionNotificationType(reaction: ReactionType): NotificationType | null {
  if (reaction === 'BEEN_THERE') return 'RELATED';
  if (reaction === 'HELPFUL') return 'HELPED';
  return null;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly repo: NotificationsRepository) {}

  /** Fold a reaction into a single (recipient, l, type) notification, bumped to the top. */
  async notifyReaction(input: {
    recipientId: string;
    actorId: string;
    lId: string;
    reaction: ReactionType;
  }): Promise<void> {
    if (input.recipientId === input.actorId) return;
    const type = reactionNotificationType(input.reaction);
    if (!type) return;
    const existing = await this.repo.findExisting(input.recipientId, input.lId, type);
    if (existing) {
      await this.repo.bump(existing.id);
    } else {
      await this.repo.create({
        type,
        recipientId: input.recipientId,
        actorId: input.actorId,
        lId: input.lId,
      });
    }
  }

  /** When the last relevant reaction is removed, drop the folded notification. */
  async clearReactionNotification(input: {
    recipientId: string;
    lId: string;
    reaction: ReactionType;
  }): Promise<void> {
    const type = reactionNotificationType(input.reaction);
    if (!type) return;
    await this.repo.deleteExisting(input.recipientId, input.lId, type);
  }

  async notifyComment(input: {
    recipientId: string;
    actorId: string;
    lId: string;
  }): Promise<void> {
    if (input.recipientId === input.actorId) return;
    await this.repo.create({
      type: 'COMMENT',
      recipientId: input.recipientId,
      actorId: input.actorId,
      lId: input.lId,
    });
  }

  async notifyFollow(input: { recipientId: string; actorId: string }): Promise<void> {
    if (input.recipientId === input.actorId) return;
    await this.repo.create({
      type: 'NEW_FOLLOWER',
      recipientId: input.recipientId,
      actorId: input.actorId,
      lId: null,
    });
  }

  async list(recipientId: string, query: PaginationQuery): Promise<Paginated<Notification>> {
    const page = await this.repo.listByRecipient(
      recipientId,
      query.limit,
      decodeCursorId(query.cursor),
    );
    return mapPage(page, toNotification);
  }

  async unreadCount(recipientId: string): Promise<UnreadCount> {
    return { count: await this.repo.unreadCount(recipientId) };
  }

  async markRead(id: string, recipientId: string): Promise<{ ok: true }> {
    await this.repo.markRead(id, recipientId);
    return { ok: true };
  }

  async markAllRead(recipientId: string): Promise<{ ok: true }> {
    await this.repo.markAllRead(recipientId);
    return { ok: true };
  }
}
