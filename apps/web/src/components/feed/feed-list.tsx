"use client";

import * as React from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { LCard as LCardType, Paginated } from "@linkedout/contracts/v2";

import { errorMessage, getFeed, type FeedScope, type FeedSort } from "@/lib/api";
import { LCard } from "@/components/l/l-card";
import { LCardSkeleton } from "@/components/l/l-card-skeleton";
import { Button } from "@/components/ui/button";
import { usePrincipal } from "@/components/session-provider";
import { queryKeys } from "@/lib/query-keys";

function EmptyState({ scope }: { scope: FeedScope }) {
  const message =
    scope === "following"
      ? "Follow some builders and their Ls will show up here."
      : "No Ls to show yet.";
  return (
    <div className="border-border/60 rounded-xl border border-dashed py-16 text-center">
      <p className="text-muted-foreground text-sm">{message}</p>
    </div>
  );
}

export function FeedList({
  initial,
  scope,
  sort,
}: {
  initial: Paginated<LCardType>;
  scope: FeedScope;
  sort: FeedSort;
}) {
  const principal = usePrincipal();
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isError,
    error,
    refetch,
    isRefetching,
  } = useInfiniteQuery({
    queryKey: queryKeys.feed.infinite(principal, scope, sort),
    queryFn: ({ pageParam }) => getFeed({ scope, sort, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    initialData: { pages: [initial], pageParams: [undefined] },
  });

  const cards = data?.pages.flatMap((page) => page.data) ?? [];

  const sentinelRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: "600px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (cards.length === 0 && !isError) {
    return <EmptyState scope={scope} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {cards.map((l) => (
        <LCard key={l.id} l={l} />
      ))}

      {isError ? (
        <div className="flex flex-col items-center gap-2 py-6">
          <p className="text-muted-foreground text-sm">{errorMessage(error, "Couldn't load the feed.")}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
            Try again
          </Button>
        </div>
      ) : null}

      <div ref={sentinelRef} aria-hidden className="h-px" />

      {isFetchingNextPage ? (
        <>
          <LCardSkeleton />
          <LCardSkeleton />
        </>
      ) : null}

      {!hasNextPage && !isError && cards.length > 0 ? (
        <p className="text-muted-foreground py-8 text-center text-xs">
          You&apos;ve reached the end — that&apos;s every L, for now.
        </p>
      ) : null}
    </div>
  );
}
