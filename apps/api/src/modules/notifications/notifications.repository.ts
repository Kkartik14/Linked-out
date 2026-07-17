import { Injectable } from '@nestjs/common';
import { Prisma } from '@linkedout/db';

import { PrismaService } from '../../prisma/prisma.service';
import { buildPage, type EntityPage } from '../../common/pagination/paginate';
import { encodeCursor } from '../../common/pagination/cursor';

export interface NotificationPageCursor {
  createdAt: Date;
  id: string;
}

export type NotificationWithRelations = Prisma.NotificationGetPayload<{
  include: {
    actor: { select: { id: true; username: true; name: true; image: true; status: true } };
    l: {
      select: {
        id: true;
        title: true;
        authorId: true;
        beenThereCount: true;
        helpfulCount: true;
        reactions: { select: { type: true } };
      };
    };
  };
}>;

function notificationInclude(recipientId: string) {
  return {
    actor: { select: { id: true, username: true, name: true, image: true, status: true } },
    l: {
      select: {
        id: true,
        title: true,
        // Lets the mapper tell whether this recipient owns the L or is being notified as the
        // author of a comment someone replied to — the two need different copy.
        authorId: true,
        beenThereCount: true,
        helpfulCount: true,
        // The denormalized counters include the L author's own reactions. Fetch at most
        // their two relevant reaction rows so the mapper can preserve the external-builder
        // wording without hydrating every reactor on the L. The `userId` filter is what makes
        // this the *recipient's* own reactions; the mapper's subtraction depends on it.
        reactions: {
          where: { userId: recipientId, type: { in: ['BEEN_THERE', 'HELPFUL'] } },
          select: { type: true },
        },
      },
    },
  } satisfies Prisma.NotificationInclude;
}

@Injectable()
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByRecipient(
    recipientId: string,
    limit: number,
    cursor: NotificationPageCursor | undefined,
  ): Promise<EntityPage<NotificationWithRelations>> {
    const cursorWhere: Prisma.NotificationWhereInput | null = cursor
      ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }
      : null;
    const rows = await this.prisma.db.notification.findMany({
      where: { recipientId, ...(cursorWhere ? { AND: [cursorWhere] } : {}) },
      include: notificationInclude(recipientId),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    return buildPage(rows, limit, (row) =>
      encodeCursor({ createdAt: row.createdAt.toISOString(), id: row.id }),
    );
  }

  async unreadCount(recipientId: string): Promise<number> {
    // The header renders only 0–9 and "9+". Avoid an exact scan of an arbitrarily large
    // inbox; the notifications page remains the source for the complete list.
    const rows = await this.prisma.db.notification.findMany({
      where: { recipientId, readAt: null },
      select: { id: true },
      take: 10,
    });
    return rows.length;
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
