"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { Reputation, UserProfile } from "@linkedout/contracts";

import { getProfile } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { usePrincipal } from "@/components/session-provider";
import { statusOption, useMeta } from "@/components/meta-provider";
import { UserAvatar } from "@/components/user-avatar";
import { FollowButton } from "@/components/profile/follow-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { compactNumber } from "@/lib/format";

const PROFILE_STALE_TIME_MS = 60_000;

function isReputationEntry(
  entry: { key: string; label: string },
  reputation: Reputation,
): entry is { key: keyof Reputation; label: string } {
  return Object.hasOwn(reputation, entry.key);
}

export function ProfileHeader({ profile: initialProfile }: { profile: UserProfile }) {
  const principal = usePrincipal();
  const meta = useMeta();
  const profileQuery = useQuery({
    queryKey: queryKeys.profiles.detail(principal, initialProfile.username),
    queryFn: () => getProfile(initialProfile.username),
    initialData: initialProfile,
    // The RSC payload came from a no-store request moments before hydration. Treat it as
    // fresh for one minute to avoid an identical mount fetch, but keep finite freshness so
    // invalidation/remounts can still reconcile server changes.
    initialDataUpdatedAt: () => Date.now(),
    staleTime: PROFILE_STALE_TIME_MS,
  });
  const profile = profileQuery.data;
  const status = statusOption(meta, profile.status);
  const reputationEntries = meta.reputation.filter((entry) =>
    isReputationEntry(entry, profile.reputation),
  );

  return (
    <header className="flex flex-col gap-4">
      <div className="flex items-start gap-4">
        <UserAvatar
          name={profile.name}
          username={profile.username}
          image={profile.image}
          statusDot={status?.dot}
          className="size-16 text-lg"
        />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">
            {profile.name ?? profile.username}
          </h1>
          <p className="text-muted-foreground text-sm">@{profile.username}</p>
          {status ? (
            <Badge variant="secondary" className="mt-1.5 gap-1">
              <span aria-hidden>{status.dot}</span>
              {status.label}
            </Badge>
          ) : null}
        </div>
        <div className="shrink-0">
          {profile.viewer.isSelf ? (
            <Button asChild variant="outline">
              <Link href="/settings">Edit profile</Link>
            </Button>
          ) : (
            <FollowButton username={profile.username} following={profile.viewer.isFollowing} />
          )}
        </div>
      </div>

      {profile.bio ? <p className="text-[15px] leading-relaxed">{profile.bio}</p> : null}

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-lg border p-3 text-sm">
        {reputationEntries.map((r) => (
          <div key={r.key}>
            <span className="font-semibold">{compactNumber(profile.reputation[r.key])}</span>{" "}
            <span className="text-muted-foreground">{r.label}</span>
          </div>
        ))}
      </div>

      <p className="text-muted-foreground text-xs">
        {compactNumber(profile.counts.followers)} followers ·{" "}
        {compactNumber(profile.counts.following)} following
      </p>
    </header>
  );
}
