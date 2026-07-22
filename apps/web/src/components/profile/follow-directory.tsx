"use client";

import Link from "next/link";
import type { FollowListUser, Paginated } from "@linkedout/contracts";

import { getFollowers, getFollowing } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { usePrincipal } from "@/components/session-provider";
import { statusOption, useMeta } from "@/components/meta-provider";
import { InfiniteList } from "@/components/infinite-list";
import { EmptyState } from "@/components/empty-state";
import { UserAvatar } from "@/components/user-avatar";
import { DirectoryFollowButton } from "@/components/profile/directory-follow-button";
import { Skeleton } from "@/components/ui/skeleton";

export type FollowDirectoryVariant = "followers" | "following";

const EMPTY_COPY: Record<FollowDirectoryVariant, string> = {
  followers: "No followers yet.",
  following: "Not following anyone yet.",
};

/**
 * The people behind a follower/following count. One shared infinite list parameterized by
 * variant: the fetcher, query key, and empty copy switch on `followers | following`; the
 * server-seeded first page, cursor pagination, skeleton, empty, and retry all come from the
 * shared `InfiniteList` primitive. Row identity is `UserSummary.id`, so duplicate display names
 * never collide.
 */
export function FollowDirectory({
  username,
  variant,
  initial,
}: {
  username: string;
  variant: FollowDirectoryVariant;
  initial?: Paginated<FollowListUser>;
}) {
  const principal = usePrincipal();
  const fetchPage = variant === "followers" ? getFollowers : getFollowing;
  const queryKey =
    variant === "followers"
      ? queryKeys.users.followers(principal, username)
      : queryKeys.users.following(principal, username);

  return (
    <InfiniteList<FollowListUser>
      queryKey={queryKey}
      queryFn={(cursor) => fetchPage(username, cursor)}
      initial={initial}
      getItemKey={(item) => item.user.id}
      renderItem={(item) => <FollowDirectoryRow item={item} />}
      empty={<EmptyState description={EMPTY_COPY[variant]} />}
      skeleton={
        <>
          <FollowRowSkeleton />
          <FollowRowSkeleton />
          <FollowRowSkeleton />
        </>
      }
      loadingLabel={variant === "followers" ? "Loading followers…" : "Loading following…"}
      className="flex flex-col gap-2"
    />
  );
}

function FollowDirectoryRow({ item }: { item: FollowListUser }) {
  const meta = useMeta();
  const { user, viewer } = item;
  const status = statusOption(meta, user.status);

  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <Link
        href={`/u/${user.username}`}
        className="hover:bg-accent/50 -m-1 flex min-w-0 flex-1 items-center gap-3 rounded-md p-1 transition-colors"
      >
        <UserAvatar
          name={user.name}
          username={user.username}
          image={user.image}
          statusDot={status?.dot}
          className="size-10"
        />
        <div className="min-w-0">
          <p className="truncate font-medium">{user.name ?? user.username}</p>
          <p className="text-muted-foreground truncate text-sm">
            @{user.username}
            {status ? ` · ${status.label}` : ""}
          </p>
        </div>
      </Link>
      {viewer.isSelf ? null : (
        <DirectoryFollowButton username={user.username} initialFollowing={viewer.isFollowing} />
      )}
    </div>
  );
}

function FollowRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <Skeleton className="size-10 rounded-full" />
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="h-3 w-20" />
      </div>
      <Skeleton className="ml-auto h-8 w-20 rounded-md" />
    </div>
  );
}
