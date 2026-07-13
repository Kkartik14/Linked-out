import { Injectable } from '@nestjs/common';
import type {
  Notification,
  Paginated,
  PaginationQuery,
  UnreadCount,
} from '@linkedout/contracts';

import { AppErrors } from '../../common/errors/app-exception';
import { decodeCursor } from '../../common/pagination/cursor';
import { mapPage } from '../../common/pagination/paginate';
import {
  NotificationsRepository,
  type NotificationPageCursor,
} from './notifications.repository';
import { toNotification } from './notifications.mapper';

function notificationCursor(cursor: string | undefined): NotificationPageCursor | undefined {
  if (cursor === undefined) return undefined;
  const payload = decodeCursor(cursor);
  const createdAt =
    typeof payload.createdAt === 'string' ? new Date(payload.createdAt) : new Date(Number.NaN);
  if (
    Number.isNaN(createdAt.getTime()) ||
    typeof payload.createdAt !== 'string' ||
    createdAt.toISOString() !== payload.createdAt ||
    typeof payload.id !== 'string' ||
    payload.id.length === 0
  ) {
    throw AppErrors.badCursor();
  }
  return { createdAt, id: payload.id };
}

@Injectable()
export class NotificationsService {
  constructor(private readonly repo: NotificationsRepository) {}

  async list(recipientId: string, query: PaginationQuery): Promise<Paginated<Notification>> {
    const page = await this.repo.listByRecipient(
      recipientId,
      query.limit,
      notificationCursor(query.cursor),
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
