import { Injectable } from '@nestjs/common';
import { Prisma, type NotificationType } from '@linkedout/db';

import { PrismaService } from '../../prisma/prisma.service';
import { buildPage, type EntityPage } from '../../common/pagination/paginate';
import { encodeCursor } from '../../common/pagination/cursor';

export type NotificationWithRelations = Prisma.NotificationGetPayload<{
  include: {
    actor: { select: { id: true; username: true; name: true; image: true; status: true } };
    l: { select: { id: true; title: true; beenThereCount: true; helpfulCount: true } };
  };
}>;

const NOTIFICATION_INCLUDE = {
  actor: { select: { id: true, username: true, name: true, image: true, status: true } },
  l: { select: { id: true, title: true, beenThereCount: true, helpfulCount: true } },
} satisfies Prisma.NotificationInclude;

export interface CreateNotificationData {
  type: NotificationType;
  recipientId: string;
  actorId: string | null;
  lId: string | null;
}

@Injectable()
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateNotificationData): Promise<{ id: string }> {
    return this.prisma.db.notification.create({ data, select: { id: true } });
  }

  /** Finds an existing (recipient, l, type) notification to fold repeat events into. */
  findExisting(
    recipientId: string,
    lId: string,
    type: NotificationType,
  ): Promise<{ id: string } | null> {
    return this.prisma.db.notification.findFirst({
      where: { recipientId, lId, type },
      select: { id: true },
    });
  }

  bump(id: string): Promise<void> {
    return this.prisma.db.notification
      .update({ where: { id }, data: { readAt: null, createdAt: new Date() }, select: { id: true } })
      .then(() => undefined);
  }

  deleteExisting(recipientId: string, lId: string, type: NotificationType): Promise<void> {
    return this.prisma.db.notification
      .deleteMany({ where: { recipientId, lId, type } })
      .then(() => undefined);
  }

  async listByRecipient(
    recipientId: string,
    limit: number,
    cursorId: string | undefined,
  ): Promise<EntityPage<NotificationWithRelations>> {
    const rows = await this.prisma.db.notification.findMany({
      where: { recipientId },
      include: NOTIFICATION_INCLUDE,
      orderBy: { id: 'desc' },
      take: limit + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    });
    return buildPage(rows, limit, (row) => encodeCursor({ id: row.id }));
  }

  unreadCount(recipientId: string): Promise<number> {
    return this.prisma.db.notification.count({ where: { recipientId, readAt: null } });
  }

  markRead(id: string, recipientId: string): Promise<number> {
    return this.prisma.db.notification
      .updateMany({ where: { id, recipientId, readAt: null }, data: { readAt: new Date() } })
      .then((result) => result.count);
  }

  markAllRead(recipientId: string): Promise<void> {
    return this.prisma.db.notification
      .updateMany({ where: { recipientId, readAt: null }, data: { readAt: new Date() } })
      .then(() => undefined);
  }
}
