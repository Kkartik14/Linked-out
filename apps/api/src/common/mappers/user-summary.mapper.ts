import type { JourneyStatus, UserSummary } from '@linkedout/contracts';

/** Structural source for a user summary (a Prisma user row selects these fields). */
export interface UserSummarySource {
  id: string;
  username: string | null;
  name: string | null;
  image: string | null;
  status: JourneyStatus | null;
}

/** Pure mapper — safe to import anywhere without module cycles. */
export function toUserSummary(user: UserSummarySource): UserSummary {
  return {
    id: user.id,
    username: user.username ?? '',
    name: user.name,
    image: user.image,
    status: user.status,
  };
}

/** The Prisma `select` that satisfies UserSummarySource. */
export const USER_SUMMARY_SELECT = {
  id: true,
  username: true,
  name: true,
  image: true,
  status: true,
} as const;
