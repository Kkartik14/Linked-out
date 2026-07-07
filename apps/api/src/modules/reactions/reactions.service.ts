import { Injectable } from '@nestjs/common';
import type { ReactionResult, ReactionType } from '@linkedout/contracts';

import type { AuthUser } from '../../common/types/auth';
import { LsService } from '../ls/ls.service';
import { foldedReactionKey, reactionNotificationType } from '../notifications/notification-events';
import { ReactionsRepository } from './reactions.repository';

@Injectable()
export class ReactionsService {
  constructor(
    private readonly repo: ReactionsRepository,
    private readonly ls: LsService,
  ) {}

  async react(user: AuthUser, lId: string, type: ReactionType): Promise<ReactionResult> {
    const l = await this.ls.getViewableL(lId, user.id);
    const notificationType = reactionNotificationType(type);
    const notification =
      notificationType && l.authorId !== user.id
        ? {
            type: notificationType,
            recipientId: l.authorId,
            actorId: user.id,
            lId,
            dedupeKey: foldedReactionKey(l.authorId, lId, notificationType),
          }
        : null;
    await this.repo.add(user.id, lId, type, l.authorId, notification);
    return this.repo.resultFor(lId, user.id);
  }

  async unreact(user: AuthUser, lId: string, type: ReactionType): Promise<ReactionResult> {
    const l = await this.ls.getViewableL(lId, user.id);
    const notificationType = reactionNotificationType(type);
    const clearNotification = notificationType
      ? {
          dedupeKey: foldedReactionKey(l.authorId, lId, notificationType),
          recipientId: l.authorId,
          lId,
          reactionType: type,
        }
      : null;
    await this.repo.remove(user.id, lId, type, l.authorId, clearNotification);
    return this.repo.resultFor(lId, user.id);
  }
}
