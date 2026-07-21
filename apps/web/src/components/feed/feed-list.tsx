"use client";

import type { LCard as LCardType, Paginated } from "@linkedout/contracts";

import { getFeed, type FeedScope, type FeedSort } from "@/lib/api";
import { EmptyState } from "@/components/empty-state";
import { InfiniteList } from "@/components/infinite-list";
import { LCard } from "@/components/l/l-card";
import { LCardSkeleton } from "@/components/l/l-card-skeleton";
import { usePrincipal } from "@/components/session-provider";
import { queryKeys } from "@/lib/query-keys";

function emptyMessage(scope: FeedScope): string {
  return scope === "following"
    ? "Follow some builders and their Ls will show up here."
    : "No Ls to show yet.";
}

/**
 * The centre column. Everything about paging — the observer, the retry, the skeletons — is
 * `InfiniteList`; the feed only supplies what is actually feed-specific: its query, its two
 * empty messages, and its end note.
 */
export function FeedList({
  initial,
  scope,
  sort,
}: {
  initial?: Paginated<LCardType>;
  scope: FeedScope;
  sort: FeedSort;
}) {
  const principal = usePrincipal();

  return (
    <InfiniteList<LCardType>
      queryKey={queryKeys.feed.infinite(principal, scope, sort)}
      queryFn={(cursor) => getFeed({ scope, sort, cursor })}
      initial={initial}
      renderItem={(l) => <LCard l={l} />}
      getItemKey={(l) => l.id}
      empty={<EmptyState description={emptyMessage(scope)} />}
      skeleton={
        <>
          <LCardSkeleton />
          <LCardSkeleton />
        </>
      }
      className="flex flex-col gap-4"
      errorFallback="Couldn't load the feed."
      endNote={
        <p className="text-muted-foreground py-8 text-center text-xs">
          You&apos;ve reached the end — that&apos;s every L, for now.
        </p>
      }
    />
  );
}
