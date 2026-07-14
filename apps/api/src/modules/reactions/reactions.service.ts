import { Injectable } from '@nestjs/common';
import type { ReactionResult, ReactionType } from '@linkedout/contracts';

import { AppErrors } from '../../common/errors/app-exception';
import type { AuthUser } from '../../common/types/auth';
import { LsService } from '../ls/ls.service';
import { ReactionsRepository } from './reactions.repository';
import { planReactionAdd, planReactionRemove } from './reactions.plan';

@Injectable()
export class ReactionsService {
  constructor(
    private readonly repo: ReactionsRepository,
    private readonly ls: LsService,
  ) {}

  async react(user: AuthUser, lId: string, type: ReactionType): Promise<ReactionResult> {
    const l = await this.ls.getViewableL(lId, user.id);
    await this.repo.add(planReactionAdd(user.id, lId, type, l.authorId));
    return this.resultFor(lId, user.id);
  }

  async unreact(user: AuthUser, lId: string, type: ReactionType): Promise<ReactionResult> {
    // Removing an existing reaction remains permitted after the L becomes hidden. If no
    // reaction exists, retain the normal visibility check so this endpoint cannot probe ids.
    const l =
      (await this.repo.findExistingOwner(user.id, lId, type)) ??
      (await this.ls.getViewableL(lId, user.id));
    await this.repo.remove(planReactionRemove(user.id, lId, type, l.authorId));
    return this.resultFor(lId, user.id);
  }

  private async resultFor(lId: string, viewerId: string): Promise<ReactionResult> {
    const state = await this.repo.findState(lId, viewerId);
    if (!state) throw AppErrors.lNotFound();
    return {
      reactions: state.counters,
      viewer: { reactions: state.viewerReactions },
    };
  }
}
