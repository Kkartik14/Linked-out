import { Injectable } from '@nestjs/common';
import { Prisma } from '@linkedout/db';

import { PrismaService } from '../../prisma/prisma.service';
import { buildPage, type EntityPage } from '../../common/pagination/paginate';
import { decodeCursor, encodeCursor } from '../../common/pagination/cursor';
import { AppErrors } from '../../common/errors/app-exception';

export type NotificationWithRelations = Prisma.NotificationGetPayload<{
  include: {
    actor: { select: { id: true; username: true; name: true; image: true; status: true } };
    l: {
      select: {
        id: true;
        title: true;
        reactions: {
          select: { type: true; userId: true };
          where: { type: { in: ['BEEN_THERE', 'HELPFUL'] } };
        };
      };
    };
  };
}>;

const NOTIFICATION_INCLUDE = {
  actor: { select: { id: true, username: true, name: true, image: true, status: true } },
  l: {
    select: {
      id: true,
      title: true,
      reactions: {
        where: { type: { in: ['BEEN_THERE', 'HELPFUL'] } },
        select: { type: true, userId: true },
      },
    },
  },
} satisfies Prisma.NotificationInclude;

@Injectable()
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByRecipient(
    recipientId: string,
    limit: number,
    cursor: string | undefined,
  ): Promise<EntityPage<NotificationWithRelations>> {
    let cursorWhere: Prisma.NotificationWhereInput | null = null;
    if (cursor) {
      const payload = decodeCursor(cursor);
      const createdAt = typeof payload.createdAt === 'string' ? new Date(payload.createdAt) : null;
      const id = typeof payload.id === 'string' ? payload.id : null;
      if (!createdAt || Number.isNaN(createdAt.getTime()) || !id) throw AppErrors.badCursor();
      cursorWhere = {
        OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }],
      };
    }
    const rows = await this.prisma.db.notification.findMany({
      where: { recipientId, ...(cursorWhere ? { AND: [cursorWhere] } : {}) },
      include: NOTIFICATION_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    return buildPage(rows, limit, (row) =>
      encodeCursor({ createdAt: row.createdAt.toISOString(), id: row.id }),
    );
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
