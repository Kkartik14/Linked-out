import { Injectable } from '@nestjs/common';
import type { FeedSidebarResponse } from '@linkedout/contracts/v2';

import { AppErrors } from '../../common/errors/app-exception';
import { toUserSummary } from '../../common/mappers/user-summary.mapper';
import type { AuthUser } from '../../common/types/auth';
import { toV2LCard } from '../ls/ls-v2.mapper';
import { toUserProfile } from '../users/users.mapper';
import {
  FeedSidebarRepository,
  type DailySelectionSnapshot,
  type RankedLCandidate,
} from './feed-sidebar.repository';

const REFRESH_AFTER_MS = 60_000;
const NEGATIVE_SELECTION_RETRY_MS = 60_000;
const TOP_LS_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;
const PEOPLE_ACTIVITY_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000;
const SIDEBAR_ITEM_LIMIT = 5;
const TOP_LS_WINDOW_LABEL = 'Past 7 days';

function startOfUtcDay(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

function hasUsername(username: string | null | undefined): username is string {
  return typeof username === 'string' && username.trim().length > 0;
}

function interactionLabel(count: number): string {
  return `${count} ${count === 1 ? 'builder' : 'builders'} interacted`;
}

function snapshotCandidate(
  snapshot: DailySelectionSnapshot | null,
  now: Date,
): { reusable: boolean; candidate: RankedLCandidate | null } {
  if (!snapshot) return { reusable: false, candidate: null };
  if (snapshot.lId === null) {
    return {
      reusable:
        snapshot.interactionCount === 0 &&
        now.getTime() - snapshot.selectedAt.getTime() < NEGATIVE_SELECTION_RETRY_MS,
      candidate: null,
    };
  }
  const l = snapshot.l;
  const eligible =
    l !== null &&
    l.visibility === 'PUBLIC' &&
    !l.isAnonymous &&
    hasUsername(l.author.username);
  return {
    reusable: eligible,
    candidate: eligible
      ? { id: snapshot.lId, interactionCount: snapshot.interactionCount }
      : null,
  };
}

@Injectable()
export class FeedSidebarService {
  constructor(private readonly repo: FeedSidebarRepository) {}

  async load(user: AuthUser | undefined): Promise<FeedSidebarResponse> {
    const generatedAt = new Date();
    const ready = user !== undefined && hasUsername(user.username);
    const topStartsAt = new Date(generatedAt.getTime() - TOP_LS_WINDOW_MS);
    const dailyEndsAt = startOfUtcDay(generatedAt);
    const dailyStartsAt = new Date(dailyEndsAt.getTime() - 24 * 60 * 60 * 1_000);
    const [profileRow, suggestedUsers, dailyCandidate] = await Promise.all([
      user ? this.repo.viewerProfile(user.id) : Promise.resolve(null),
      this.repo.suggestedUsers({
        viewerId: ready ? user.id : undefined,
        activityStartsAt: new Date(generatedAt.getTime() - PEOPLE_ACTIVITY_WINDOW_MS),
        activityEndsAt: generatedAt,
        limit: SIDEBAR_ITEM_LIMIT,
      }),
      this.dailyCandidate({
        selectedFor: dailyEndsAt,
        startsAt: dailyStartsAt,
        endsAt: dailyEndsAt,
        now: generatedAt,
      }),
    ]);
    if (user && !profileRow) throw AppErrors.userNotFound();
    const profile = profileRow
      ? toUserProfile(profileRow, { isSelf: true, isFollowing: false })
      : null;
    const topCandidates = await this.repo.rankedLs({
      startsAt: topStartsAt,
      endsAt: generatedAt,
      attributedOnly: false,
      excludeLId: dailyCandidate?.id,
      limit: SIDEBAR_ITEM_LIMIT,
    });
    const rows = await this.repo.publicLs(
      [
        ...(dailyCandidate ? [dailyCandidate.id] : []),
        ...topCandidates.map((candidate) => candidate.id),
      ],
      user?.id,
    );
    const cards = rows.map(({ l, viewerReactions }) =>
      toV2LCard(l, {
        reactions: viewerReactions,
        canEdit: user?.id === l.authorId,
      }),
    );
    const cardById = new Map(cards.map((card) => [card.id, card]));
    // Carry each ranked candidate's count alongside its card rather than re-joining them by id
    // later: the count is what ranked the L, so it cannot go missing for a card that survived.
    const topFeatured = topCandidates
      .map((candidate) => {
        const card = cardById.get(candidate.id);
        return card ? { card, interactionCount: candidate.interactionCount } : null;
      })
      .filter((featured) => featured !== null);
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
              interactionLabel: interactionLabel(dailyCandidate.interactionCount),
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
        windowLabel: TOP_LS_WINDOW_LABEL,
        items: topFeatured.map(({ card, interactionCount }) => ({
          l: card,
          interactionCount,
          interactionLabel: interactionLabel(interactionCount),
        })),
      },
      lOfTheDay,
    };
  }

  private async dailyCandidate(params: {
    selectedFor: Date;
    startsAt: Date;
    endsAt: Date;
    now: Date;
  }): Promise<RankedLCandidate | null> {
    let snapshot = await this.repo.dailySelection(params.selectedFor);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = snapshotCandidate(snapshot, params.now);
      if (current.reusable) return current.candidate;

      const [candidate = null] = await this.repo.rankedLs({
        startsAt: params.startsAt,
        endsAt: params.endsAt,
        attributedOnly: true,
        limit: 1,
      });
      const result = await this.repo.storeDailySelection({
        selectedFor: params.selectedFor,
        expectedSelectedAt: snapshot?.selectedAt ?? null,
        candidate,
      });
      snapshot = result.snapshot;
      const stored = snapshotCandidate(snapshot, params.now);
      if (stored.reusable) return stored.candidate;
    }
    return null;
  }
}
