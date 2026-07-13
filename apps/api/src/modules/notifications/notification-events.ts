import type { NotificationType, ReactionType } from '@linkedout/contracts';

export function reactionNotificationType(reaction: ReactionType): NotificationType | null {
  if (reaction === 'BEEN_THERE') return 'RELATED';
  if (reaction === 'HELPFUL') return 'HELPED';
  return null;
}

export function foldedReactionKey(
  recipientId: string,
  lId: string,
  type: NotificationType,
): string {
  return `${recipientId}:${lId}:${type}`;
}
