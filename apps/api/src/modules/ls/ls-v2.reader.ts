import { Injectable } from '@nestjs/common';
import type { LCard, ReactionType } from '@linkedout/contracts/v2';

import { LsRepository, type LWithAuthor } from './ls.repository';
import { toV2LCard } from './ls-v2.mapper';

@Injectable()
export class LsV2Reader {
  constructor(private readonly repo: LsRepository) {}

  async publicCards(ids: string[], viewerId: string | undefined): Promise<LCard[]> {
    const rows = await this.repo.hydrateVisibleOrdered(ids, undefined);
    const reactions = await this.viewerReactionMap(viewerId, rows);
    return rows.map((row) =>
      toV2LCard(row, {
        reactions: reactions.get(row.id) ?? [],
        canEdit: viewerId === row.authorId,
      }),
    );
  }

  private async viewerReactionMap(
    viewerId: string | undefined,
    rows: LWithAuthor[],
  ): Promise<Map<string, ReactionType[]>> {
    const result = new Map<string, ReactionType[]>();
    if (!viewerId || rows.length === 0) return result;
    const reactions = await this.repo.viewerReactions(
      viewerId,
      rows.map((row) => row.id),
    );
    for (const reaction of reactions) {
      const existing = result.get(reaction.lId);
      if (existing) existing.push(reaction.type);
      else result.set(reaction.lId, [reaction.type]);
    }
    return result;
  }
}
