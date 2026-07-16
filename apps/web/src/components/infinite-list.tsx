"use client";

import * as React from "react";
import { useInfiniteQuery, type QueryKey } from "@tanstack/react-query";
import type { Paginated } from "@linkedout/contracts/v2";

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
}: {
  queryKey: QueryKey;
  queryFn: (cursor: string | undefined) => Promise<Paginated<T>>;
  initial?: Paginated<T>;
  renderItem: (item: T) => React.ReactNode;
  getItemKey: (item: T) => string;
  empty?: React.ReactNode;
  skeleton?: React.ReactNode;
  className?: string;
}) {
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => queryFn(pageParam),
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
    return <div className={className}>{skeleton}</div>;
  }

  if (items.length === 0 && !query.isError) {
    return <>{empty}</>;
  }

  return (
    <div className={className}>
      {items.map((item) => (
        <React.Fragment key={getItemKey(item)}>{renderItem(item)}</React.Fragment>
      ))}

      {query.isError ? (
        <div className="flex flex-col items-center gap-2 py-6">
          <p className="text-muted-foreground text-sm">{errorMessage(query.error)}</p>
          <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isRefetching}>
            Try again
          </Button>
        </div>
      ) : null}

      <div ref={sentinelRef} aria-hidden className="h-px" />
      {query.isFetchingNextPage ? skeleton : null}
    </div>
  );
}
