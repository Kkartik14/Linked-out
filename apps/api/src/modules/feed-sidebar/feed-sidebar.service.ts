import { Injectable } from '@nestjs/common';
import type { FeedSidebarResponse } from '@linkedout/contracts/v2';

import type { AuthUser } from '../../common/types/auth';
import { toUserSummary } from '../../common/mappers/user-summary.mapper';
import { UsersService } from '../users/users.service';
import { LsV2Reader } from '../ls/ls-v2.reader';
import { FeedSidebarRepository } from './feed-sidebar.repository';

const REFRESH_AFTER_MS = 60_000;
const TOP_LS_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;
const PEOPLE_ACTIVITY_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000;
const SIDEBAR_ITEM_LIMIT = 5;

function startOfUtcDay(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

@Injectable()
export class FeedSidebarService {
  constructor(
    private readonly repo: FeedSidebarRepository,
    private readonly ls: LsV2Reader,
    private readonly users: UsersService,
  ) {}

  async load(user: AuthUser | undefined): Promise<FeedSidebarResponse> {
    const generatedAt = new Date();
    const ready = user?.username !== null && user?.username !== undefined;
    const topStartsAt = new Date(generatedAt.getTime() - TOP_LS_WINDOW_MS);
    const dailyEndsAt = startOfUtcDay(generatedAt);
    const dailyStartsAt = new Date(dailyEndsAt.getTime() - 24 * 60 * 60 * 1_000);
    const [profile, suggestedUsers, dailyCandidate] = await Promise.all([
      user ? this.users.getSelfProfile(user.id) : Promise.resolve(null),
      this.repo.suggestedUsers({
        viewerId: ready ? user.id : undefined,
        activitySince: new Date(generatedAt.getTime() - PEOPLE_ACTIVITY_WINDOW_MS),
        limit: SIDEBAR_ITEM_LIMIT,
      }),
      this.repo.dailySelection({
        selectedFor: dailyEndsAt,
        startsAt: dailyStartsAt,
        endsAt: dailyEndsAt,
      }),
    ]);
    const topCandidates = await this.repo.rankedLs({
      startsAt: topStartsAt,
      endsAt: generatedAt,
      attributedOnly: false,
      excludeLId: dailyCandidate?.id,
      limit: SIDEBAR_ITEM_LIMIT,
    });
    const cards = await this.ls.publicCards(
      [
        ...(dailyCandidate ? [dailyCandidate.id] : []),
        ...topCandidates.map((candidate) => candidate.id),
      ],
      user?.id,
    );
    const cardById = new Map(cards.map((card) => [card.id, card]));
    const topCards = topCandidates
      .map((candidate) => cardById.get(candidate.id))
      .filter((card) => card !== undefined);
    const interactionCountByLId = new Map(
      topCandidates.map((candidate) => [candidate.id, candidate.interactionCount]),
    );
    const dailyCard = dailyCandidate ? cardById.get(dailyCandidate.id) : undefined;
    const lOfTheDay =
      dailyCandidate && dailyCard && !dailyCard.isAnonymous && dailyCard.author
        ? {
            selectedFor: dailyEndsAt.toISOString().slice(0, 10),
            basis: 'MOST_INTERACTED' as const,
            window: {
              startsAt: dailyStartsAt.toISOString(),
              endsAt: dailyEndsAt.toISOString(),
            },
            item: {
              l: { ...dailyCard, isAnonymous: false as const, author: dailyCard.author },
              interactionCount: dailyCandidate.interactionCount,
              interactionLabel: `${dailyCandidate.interactionCount} ${dailyCandidate.interactionCount === 1 ? 'builder' : 'builders'} interacted`,
            },
          }
        : null;
    return {
      contractVersion: 2,
      generatedAt: generatedAt.toISOString(),
      refreshAfter: new Date(generatedAt.getTime() + REFRESH_AFTER_MS).toISOString(),
      viewer:
        profile === null
          ? { state: 'SIGNED_OUT', profile: null }
          : ready
            ? { state: 'READY', profile }
            : { state: 'ONBOARDING_REQUIRED', profile },
      peopleToFollow: {
        personalized: ready,
        items: suggestedUsers.map((candidate) => ({
          user: toUserSummary(candidate),
          reason:
            candidate.mutualCount > 0
              ? {
                  code: 'MUTUAL_FOLLOWS',
                  count: candidate.mutualCount,
                  text: `${candidate.mutualCount} mutual ${candidate.mutualCount === 1 ? 'follow' : 'follows'}`,
                }
              : { code: 'ACTIVE_BUILDER', text: 'Active builder this month' },
          viewer: { canFollow: ready },
        })),
      },
      topLs: {
        basis: 'MOST_INTERACTED',
        window: {
          startsAt: topStartsAt.toISOString(),
          endsAt: generatedAt.toISOString(),
        },
        items: topCards.map((l) => {
          const interactionCount = interactionCountByLId.get(l.id) ?? 0;
          return {
            l,
            interactionCount,
            interactionLabel: `${interactionCount} ${interactionCount === 1 ? 'builder' : 'builders'} interacted`,
          };
        }),
      },
      lOfTheDay,
    };
  }
}
