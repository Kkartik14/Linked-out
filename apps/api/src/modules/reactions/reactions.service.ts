import { Injectable } from '@nestjs/common';
import type { ReactionResult, ReactionType } from '@linkedout/contracts';

import type { AuthUser } from '../../common/types/auth';
import { LsService } from '../ls/ls.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ReactionsRepository } from './reactions.repository';

@Injectable()
export class ReactionsService {
  constructor(
    private readonly repo: ReactionsRepository,
    private readonly ls: LsService,
    private readonly notifications: NotificationsService,
  ) {}

  async react(user: AuthUser, lId: string, type: ReactionType): Promise<ReactionResult> {
    const l = await this.ls.getViewableL(lId, user.id);
    const created = await this.repo.add(user.id, lId, type, l.authorId);
    if (created) {
      await this.notifications.notifyReaction({
        recipientId: l.authorId,
        actorId: user.id,
        lId,
        reaction: type,
      });
    }
    return this.repo.resultFor(lId, user.id);
  }

  async unreact(user: AuthUser, lId: string, type: ReactionType): Promise<ReactionResult> {
    const l = await this.ls.getViewableL(lId, user.id);
    const removed = await this.repo.remove(user.id, lId, type, l.authorId);
    const result = await this.repo.resultFor(lId, user.id);
    if (removed) {
      const emptiedBeenThere = type === 'BEEN_THERE' && result.reactions.beenThere === 0;
      const emptiedHelpful = type === 'HELPFUL' && result.reactions.helpful === 0;
      if (emptiedBeenThere || emptiedHelpful) {
        await this.notifications.clearReactionNotification({
          recipientId: l.authorId,
          lId,
          reaction: type,
        });
      }
    }
    return result;
  }
}
