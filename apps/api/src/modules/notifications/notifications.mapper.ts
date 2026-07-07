import type { Notification } from '@linkedout/contracts';

import { toUserSummary } from '../../common/mappers/user-summary.mapper';
import type { NotificationWithRelations } from './notifications.repository';

function composeMessage(n: NotificationWithRelations): string {
  switch (n.type) {
    case 'RELATED': {
      const count =
        n.l?.reactions.filter(
          (reaction) => reaction.type === 'BEEN_THERE' && reaction.userId !== n.recipientId,
        ).length ?? 0;
      return `${count} ${count === 1 ? 'builder' : 'builders'} related to your story.`;
    }
    case 'HELPED': {
      const count =
        n.l?.reactions.filter(
          (reaction) => reaction.type === 'HELPFUL' && reaction.userId !== n.recipientId,
        ).length ?? 0;
      return `Your story helped ${count} ${count === 1 ? 'person' : 'people'}.`;
    }
    case 'NEW_FOLLOWER': {
      const name = n.actor?.name ?? n.actor?.username ?? null;
      return name
        ? `${name} started following your journey.`
        : 'Someone started following your journey.';
    }
    case 'COMMENT': {
      const name = n.actor?.name ?? n.actor?.username ?? 'Someone';
      return `${name} commented on your L.`;
    }
  }
}

export function toNotification(n: NotificationWithRelations): Notification {
  return {
    id: n.id,
    type: n.type,
    actor: n.actor ? toUserSummary(n.actor) : null,
    target: n.l ? { lId: n.l.id, title: n.l.title } : null,
    message: composeMessage(n),
    readAt: n.readAt ? n.readAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
  };
}
