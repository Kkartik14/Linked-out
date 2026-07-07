import { Injectable } from '@nestjs/common';
import type {
  Notification,
  Paginated,
  PaginationQuery,
  UnreadCount,
} from '@linkedout/contracts';

import { mapPage } from '../../common/pagination/paginate';
import { NotificationsRepository } from './notifications.repository';
import { toNotification } from './notifications.mapper';

@Injectable()
export class NotificationsService {
  constructor(private readonly repo: NotificationsRepository) {}

  async list(recipientId: string, query: PaginationQuery): Promise<Paginated<Notification>> {
    const page = await this.repo.listByRecipient(
      recipientId,
      query.limit,
      query.cursor,
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
