"use client";

import * as React from "react";
import { useInfiniteQuery, type QueryKey } from "@tanstack/react-query";
import type { Paginated } from "@linkedout/contracts";

import { errorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";

/**
 * Generic cursor-paginated, infinite-scrolling list. Seed with a server-fetched
 * `initial` page for instant first paint, or omit it to fetch on the client.
 */
export function InfiniteList<T>({
  queryKey,
  queryFn,
  initial,
  renderItem,
  getItemKey,
  empty,
  skeleton,
  className,
  errorFallback,
  endNote,
  loadingLabel = "Loading…",
}: {
  queryKey: QueryKey;
  queryFn: (cursor: string | undefined, signal: AbortSignal) => Promise<Paginated<T>>;
  initial?: Paginated<T>;
  renderItem: (item: T) => React.ReactNode;
  getItemKey: (item: T) => string;
  empty?: React.ReactNode;
  skeleton?: React.ReactNode;
  className?: string;
  /** Shown when the list fails to load, in place of the generic message. */
  errorFallback?: string;
  /** Shown once every page has arrived and the list is non-empty. */
  endNote?: React.ReactNode;
  /**
   * What a screen reader is told is arriving, since a skeleton is silent. Mirrors the
   * sidebar rails, which name what is loading rather than saying "loading" generically.
   */
  loadingLabel?: string;
}) {
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) => queryFn(pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    ...(initial ? { initialData: { pages: [initial], pageParams: [undefined] } } : {}),
  });

  const items = query.data?.pages.flatMap((page) => page.data) ?? [];
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;

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

  if (query.isLoading) {
    return (
      <div className={className} aria-busy>
        {skeleton}
        <span className="sr-only">{loadingLabel}</span>
      </div>
    );
  }

  if (items.length === 0 && !query.isError) {
    return <>{empty}</>;
  }

  return (
    <div className={className}>
      {items.map((item) => (
        <React.Fragment key={getItemKey(item)}>{renderItem(item)}</React.Fragment>
      ))}

      {/* `alert`: this appears below content the reader has already passed, so nothing
          would draw them back to it — they would be left waiting on a page that has
          silently stopped loading, unaware a retry now exists. */}
      {query.isError ? (
        <div role="alert" className="flex flex-col items-center gap-2 py-6">
          <p className="text-muted-foreground text-sm">{errorMessage(query.error, errorFallback)}</p>
          <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isRefetching}>
            Try again
          </Button>
        </div>
      ) : null}

      <div ref={sentinelRef} aria-hidden className="h-px" />
      {query.isFetchingNextPage ? (
        <div aria-busy>
          {skeleton}
          <span className="sr-only">Loading more…</span>
        </div>
      ) : null}

      {/* Only once the list is genuinely exhausted — never while a page is still coming, and
          never as a consolation for a list that failed to load. */}
      {endNote && !hasNextPage && !query.isError && items.length > 0 ? endNote : null}
    </div>
  );
}
